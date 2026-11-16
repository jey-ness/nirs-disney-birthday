// Editable schedule: event store, encrypted live sync (Supabase), calendar day view, editor sheet.
// Edits are stored as per-event overrides on top of data/trip.json, merged by last-write-wins per event.

// ---------- time helpers ----------
export const toMin = (hm) => { const [h, m] = String(hm).split(":").map(Number); return h * 60 + (m || 0); };
export const toHM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export function fmtClock(min, { withMeridiem = true, compact = false } = {}) {
  const h24 = Math.floor(min / 60) % 24, m = min % 60;
  const h = h24 % 12 || 12, ap = h24 < 12 ? "AM" : "PM";
  const t = compact && m === 0 ? `${h}` : `${h}:${String(m).padStart(2, "0")}`;
  return withMeridiem ? `${t} ${ap}` : t;
}
export function fmtRange(a, b) {
  const sameHalf = (a < 720) === (b < 720);
  return `${fmtClock(a, { withMeridiem: !sameHalf, compact: true })} – ${fmtClock(b, { compact: true })}`;
}
const snap = (min, step) => Math.round(min / step) * step;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const FIELDS = ["title", "start", "end", "place", "tags", "note"];

// ---------- crypto (same scheme as the encrypted trip file) ----------
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64e = (u8) => { let s = ""; u8.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); };
const join = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
async function keysFrom(bits) {
  return {
    enc: await crypto.subtle.importKey("raw", bits.slice(0, 32), { name: "AES-CBC" }, false, ["encrypt", "decrypt"]),
    mac: await crypto.subtle.importKey("raw", bits.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]),
  };
}
export async function decryptWithBits(blob, bits) {
  const k = await keysFrom(bits);
  const iv = b64d(blob.iv), ct = b64d(blob.ct);
  if (!(await crypto.subtle.verify("HMAC", k.mac, b64d(blob.mac), join(iv, ct)))) throw new Error("wrong key");
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, k.enc, ct)));
}
async function encryptWithBits(obj, bits) {
  const k = await keysFrom(bits);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, k.enc, new TextEncoder().encode(JSON.stringify(obj))));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k.mac, join(iv, ct)));
  return { v: 1, iv: b64e(iv), ct: b64e(ct), mac: b64e(mac) };
}

// ---------- store ----------
const EDIT_STORE = "orlando-trip-edits-v1";
export function createStore(trip) {
  const base = {};
  for (const d of trip.days) {
    d.schedule.forEach((r, i, arr) => {
      const start = toMin(r.start);
      const next = arr[i + 1] ? toMin(arr[i + 1].start) : null;
      const end = r.end ? toMin(r.end) : next && next - start <= 180 ? next : start + (next ? 60 : 90);
      base[`${d.slug}-${i}`] = {
        id: `${d.slug}-${i}`, day: d.slug, title: r.text, start: toHM(start), end: toHM(end),
        place: r.stop ?? null, tags: r.tags || [], note: "", base: true,
      };
    });
  }
  const read = () => { try { return JSON.parse(localStorage.getItem(EDIT_STORE)) || { events: {}, dirty: false }; } catch { return { events: {}, dirty: false }; } };
  let state = read();
  const write = () => { try { localStorage.setItem(EDIT_STORE, JSON.stringify(state)); } catch { /* private mode */ } };
  const listeners = new Set();
  const emit = (src) => listeners.forEach((fn) => fn(src));
  const pick = (e) => Object.fromEntries(FIELDS.filter((f) => f in e).map((f) => [f, e[f]]));

  function eventsFor(slug) {
    const out = [];
    for (const b of Object.values(base)) {
      if (b.day !== slug) continue;
      const e = state.events[b.id];
      if (e?.deleted) continue;
      out.push(e && !e.reset ? { ...b, ...pick(e), edited: true } : { ...b });
    }
    for (const e of Object.values(state.events)) if (!base[e.id] && e.day === slug && !e.deleted) out.push({ ...e });
    return out.sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end) || a.id.localeCompare(b.id));
  }
  function touch(id, rec) {
    state.events[id] = { ...rec, id, updatedAt: Date.now() };
    state.dirty = true;
    write();
    emit("local");
  }
  return {
    eventsFor,
    isBase: (id) => !!base[id],
    newId: uid,
    upsert: (ev) => touch(ev.id, { day: ev.day, ...pick(ev) }),
    remove: (ev) => touch(ev.id, { day: ev.day, deleted: true }),
    restore: (ev) => touch(ev.id, { day: ev.day, reset: true }),
    snapshot: () => ({ events: state.events }),
    isDirty: () => state.dirty,
    markClean() { state.dirty = false; write(); },
    // last write wins, per event
    mergeRemote(remote) {
      let changed = false, localNewer = false;
      const r = remote?.events || {};
      for (const [id, e] of Object.entries(r)) {
        const mine = state.events[id];
        if (!mine || e.updatedAt > mine.updatedAt) { state.events[id] = e; changed = true; }
      }
      for (const [id, e] of Object.entries(state.events)) if (!r[id] || e.updatedAt > r[id].updatedAt) localNewer = true;
      if (changed) { write(); emit("remote"); }
      return { changed, localNewer };
    },
    onChange: (fn) => listeners.add(fn),
  };
}

// ---------- live sync (Supabase RPC; the row only ever holds ciphertext) ----------
// Table access is revoked for anon; two security-definer functions read/write one row by id.
// See supabase/setup.sql. Optimistic concurrency via a version number.
export function createSync(store, { bits, supabase }) {
  const listeners = new Set();
  let status = "local";
  const set = (s) => { status = s; listeners.forEach((fn) => fn(s)); };
  const api = { onStatus: (fn) => { listeners.add(fn); fn(status); }, status: () => status, kick() {} };
  if (!bits || !supabase?.url || !supabase?.anonKey) { set(bits ? "nosync" : "local"); return api; }

  const base = supabase.url.replace(/\/+$/, "") + "/rest/v1/rpc/";
  const headers = { "Content-Type": "application/json", apikey: supabase.anonKey, Authorization: `Bearer ${supabase.anonKey}` };
  const rpc = async (fn, body) => {
    const r = await fetch(base + fn, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
    if (!r.ok) throw new Error(`sync ${r.status}`);
    return r.json();
  };
  let rowId = null, busy = false, again = false, timer = null;
  async function id() {
    if (rowId) return rowId;
    const k = await keysFrom(bits);
    const tag = new Uint8Array(await crypto.subtle.sign("HMAC", k.mac, new TextEncoder().encode("orlando-trip-sync-v1")));
    rowId = [...tag].map((b) => b.toString(16).padStart(2, "0")).join(""); // 64 hex chars, only password holders can derive it
    return rowId;
  }
  async function fetchRemote() {
    const rows = await rpc("trip_get", { p_id: await id() });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { edits: null, version: 0 };
    return { edits: await decryptWithBits(JSON.parse(row.data), bits), version: row.version };
  }
  async function run() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        set(store.isDirty() ? "saving" : "checking");
        const { edits, version } = await fetchRemote();
        const { localNewer } = edits ? store.mergeRemote(edits) : { localNewer: Object.keys(store.snapshot().events).length > 0 };
        if (!localNewer) { store.markClean(); set("synced"); break; }
        const blob = await encryptWithBits(store.snapshot(), bits);
        const v = await rpc("trip_put", { p_id: await id(), p_data: JSON.stringify(blob), p_version: version });
        if (v > 0) { store.markClean(); set("synced"); break; }
        if (attempt === 3) throw new Error("sync conflict"); // someone saved first: loop merges theirs and retries
      }
    } catch {
      set(navigator.onLine === false ? "offline" : "error");
    } finally {
      busy = false;
      if (again) { again = false; run(); }
    }
  }
  store.onChange((src) => { if (src === "local") { set("saving"); clearTimeout(timer); timer = setTimeout(run, 600); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") run(); });
  window.addEventListener("online", run);
  setInterval(() => { if (document.visibilityState === "visible") run(); }, 30000);
  api.kick = run;
  run();
  return api;
}

export const SYNC_TEXT = {
  local: "Saved on this phone",
  nosync: "Saved on this phone · live sync not set up",
  checking: "Checking for changes…",
  saving: "Saving…",
  synced: "Synced",
  offline: "Offline · saved on this phone, will sync",
  error: "Couldn't sync · saved on this phone, will retry",
};

// ---------- calendar day view (Google Calendar style) ----------
const PX = 1.1; // px per minute
export function renderCalendar(box, events, { today, nowMin, placeLabel, onCreate, onOpen, onMove }) {
  const starts = events.map((e) => toMin(e.start)), ends = events.map((e) => toMin(e.end));
  const from = Math.min(7 * 60, Math.floor(Math.min(...starts, 24 * 60) / 60) * 60);
  const to = Math.max(23 * 60, Math.ceil(Math.max(...ends, 0) / 60) * 60);
  const y = (min) => (min - from) * PX;

  // overlap layout: group events that touch, give each a column
  const laid = [];
  let group = [], groupEnd = -1;
  const flush = () => {
    const cols = [];
    for (const ev of group) {
      let c = cols.findIndex((endMin) => endMin <= toMin(ev.start));
      if (c === -1) { c = cols.length; cols.push(0); }
      cols[c] = toMin(ev.end);
      laid.push({ ev, col: c });
    }
    const n = cols.length;
    laid.slice(-group.length).forEach((l) => (l.cols = n));
    group = []; groupEnd = -1;
  };
  for (const ev of events) {
    if (group.length && toMin(ev.start) >= groupEnd) flush();
    group.push(ev);
    groupEnd = Math.max(groupEnd, toMin(ev.end));
  }
  if (group.length) flush();

  const hours = [];
  for (let m = from; m <= to; m += 60) hours.push(m);
  box.innerHTML = `
    <div class="cal" style="height:${y(to) + 12}px">
      ${hours.map((m) => `<div class="cal-hour" style="top:${y(m)}px"><span>${m < to ? fmtClock(m, { compact: true }) : ""}</span></div>`).join("")}
      <div class="cal-grid" id="calGrid" style="height:${y(to)}px">
        ${today && nowMin >= from && nowMin <= to ? `<div class="cal-now" style="top:${y(nowMin)}px" aria-hidden="true"></div>` : ""}
        ${laid
          .map(({ ev, col, cols }) => {
            const s = toMin(ev.start), e = Math.max(toMin(ev.end), s + 15);
            const h = Math.max((e - s) * PX, 24);
            const past = today && e <= nowMin;
            const place = placeLabel(ev);
            return `<button type="button" class="ev ${past ? "past" : ""} ${h < 40 ? "short" : ""}" data-id="${esc(ev.id)}"
              style="top:${y(s)}px;height:${h - 2}px;left:calc(${(col / cols) * 100}% + 2px);width:calc(${100 / cols}% - 4px)"
              aria-label="${esc(ev.title)}, ${esc(fmtRange(s, e))}. Edit">
              <span class="ev-title">${place ? `<b class="ev-num">${esc(place)}</b>` : ""}${esc(ev.title)}</span>
              <span class="ev-time">${esc(fmtRange(s, e))}</span>
              <span class="ev-resize" aria-hidden="true"></span>
            </button>`;
          })
          .join("")}
      </div>
    </div>`;

  const grid = box.querySelector("#calGrid");
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  let drag = null;

  const minAt = (clientY) => from + (clientY - grid.getBoundingClientRect().top) / PX;
  grid.addEventListener("touchmove", (e) => { if (drag?.active) e.preventDefault(); }, { passive: false });
  grid.addEventListener("contextmenu", (e) => { if (e.target.closest(".ev")) e.preventDefault(); });

  grid.addEventListener("pointerdown", (e) => {
    if (e.button && e.button !== 0) return;
    const el = e.target.closest(".ev");
    const resize = !!e.target.closest(".ev-resize");
    drag = { el, ev: el ? byId[el.dataset.id] : null, resize, x0: e.clientX, y0: e.clientY, moved: false, active: false, pid: e.pointerId };
    if (el && resize) {
      drag.active = true; // resize handle starts at once
      el.classList.add("lifted");
      grid.setPointerCapture(e.pointerId);
    } else if (el) {
      // long press picks the event up (like Google Calendar); a quick move means scrolling
      drag.timer = setTimeout(() => {
        if (!drag || drag.moved) return;
        drag.active = true;
        el.classList.add("lifted");
        navigator.vibrate?.(12);
        try { grid.setPointerCapture(drag.pid); } catch { /* ignore */ }
      }, e.pointerType === "mouse" ? 150 : 380);
    }
  });

  grid.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dy) > 8 || Math.abs(e.clientX - drag.x0) > 8) { drag.moved = true; clearTimeout(drag.timer); }
      return;
    }
    e.preventDefault();
    const { el, ev } = drag;
    const s = toMin(ev.start), en = toMin(ev.end), delta = snap(dy / PX, 15);
    let ns = s, ne = en;
    if (drag.resize) ne = clamp(en + delta, s + 15, to);
    else { ns = clamp(s + delta, from, to - (en - s)); ne = ns + (en - s); }
    drag.ns = ns; drag.ne = ne;
    el.style.top = `${y(ns)}px`;
    el.style.height = `${Math.max((ne - ns) * PX, 24) - 2}px`;
    el.querySelector(".ev-time").textContent = fmtRange(ns, ne);
  });

  const end = (e, cancelled) => {
    if (!drag) return;
    clearTimeout(drag.timer);
    const d = drag;
    drag = null;
    if (d.active) {
      d.el.classList.remove("lifted");
      if (!cancelled && d.ns != null && (toHM(d.ns) !== d.ev.start || toHM(d.ne) !== d.ev.end)) onMove(d.ev, toHM(d.ns), toHM(d.ne));
      return;
    }
    if (cancelled || d.moved) return;
    if (d.ev) onOpen(d.ev);
    else onCreate(snap(Math.floor(minAt(e.clientY)), 30)); // tap on an empty slot
  };
  grid.addEventListener("pointerup", (e) => end(e, false));
  grid.addEventListener("pointercancel", (e) => end(e, true));
  // keyboard: Enter/Space on an event opens it (buttons already do this via click)
  grid.addEventListener("click", (e) => { if (e.detail === 0) { const el = e.target.closest(".ev"); if (el) onOpen(byId[el.dataset.id]); } });

  return { scrollToMin(min) { const top = box.getBoundingClientRect().top + window.scrollY + y(min); return top; } };
}

// ---------- editor sheet ----------
const TAG_OPTIONS = [["multi", "Multi Pass"], ["single", "Single Pass"], ["solo", "Jey solo"], ["booked", "Booked"], ["standby", "Standby"]];
export function openEditor({ ev, isNew, isBase, places, onSave, onDelete, onRestore }) {
  document.getElementById("editSheet")?.remove();
  const dlg = document.createElement("dialog");
  dlg.id = "editSheet";
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "editTitle");
  dlg.innerHTML = `
    <form method="dialog" class="sheet-body" id="editForm">
      <div class="sheet-top">
        <button type="button" class="sheet-x" id="editCancel" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <h2 id="editTitle">${isNew ? "New event" : "Edit event"}</h2>
        <button type="submit" class="sheet-save">Save</button>
      </div>
      <label class="fld"><span class="label">Title</span>
        <input name="title" type="text" required maxlength="140" value="${esc(ev.title)}" placeholder="Add title" autocomplete="off"></label>
      <div class="fld-row">
        <label class="fld"><span class="label">Starts</span><input name="start" type="time" step="300" required value="${esc(ev.start)}"></label>
        <label class="fld"><span class="label">Ends</span><input name="end" type="time" step="300" required value="${esc(ev.end)}"></label>
      </div>
      <p class="err" id="editErr" role="alert"></p>
      <label class="fld"><span class="label">Map pin</span>
        <select name="place">
          <option value="">No pin</option>
          ${places.map((p) => `<option value="${p.order}" ${String(ev.place) === String(p.order) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
        </select></label>
      <fieldset class="fld chips"><legend class="label">Tags</legend>
        ${TAG_OPTIONS.map(([v, l]) => `<label class="chip ${v}"><input type="checkbox" name="tags" value="${v}" ${ev.tags?.includes(v) ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </fieldset>
      <label class="fld"><span class="label">Note</span>
        <textarea name="note" rows="2" maxlength="500" placeholder="Add a note">${esc(ev.note || "")}</textarea></label>
      <div class="sheet-actions">
        ${isNew ? "" : `<button type="button" class="linkbtn danger" id="editDelete">Delete event</button>`}
        ${isBase && ev.edited ? `<button type="button" class="linkbtn" id="editRestore">Restore original</button>` : ""}
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector("form");
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); }); // tap outside the sheet
  dlg.querySelector("#editCancel").addEventListener("click", close);
  dlg.querySelector("#editDelete")?.addEventListener("click", () => {
    if (confirm(`Delete “${ev.title}”?`)) { onDelete(ev); close(); }
  });
  dlg.querySelector("#editRestore")?.addEventListener("click", () => { onRestore(ev); close(); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const start = f.get("start"), endT = f.get("end");
    if (toMin(endT) <= toMin(start)) { dlg.querySelector("#editErr").textContent = "End time has to be after the start."; return; }
    onSave({
      ...ev,
      title: String(f.get("title")).trim(),
      start, end: endT,
      place: f.get("place") ? Number(f.get("place")) : null,
      tags: f.getAll("tags"),
      note: String(f.get("note") || "").trim(),
    });
    close();
  });
  dlg.showModal();
  if (isNew) dlg.querySelector('input[name="title"]').focus();
}
