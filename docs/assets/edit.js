import { ph } from "./icons.js";
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
const FIELDS = ["title", "start", "end", "place", "tags", "note", "kind"];
// What each item is. The icon + word shows on every schedule row.
export const KINDS = [
  ["ride", "Ride"], ["show", "Show"], ["parade", "Parade"], ["fireworks", "Fireworks"], ["food", "Food"], ["drinks", "Drinks"],
  ["experience", "Experience"], ["explore", "Explore"], ["shopping", "Shopping"], ["travel", "Getting there"],
];

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
      const id = r.id || `${d.slug}-${i}`; // permanent ids keep synced edits on the right event when the plan is reordered
      base[id] = {
        id, day: d.slug, title: r.text, start: toHM(start), end: toHM(end),
        place: r.stop ?? null, tags: r.tags || [], note: r.note || "", kind: r.kind || "", base: true,
      };
    });
  }
  const read = () => { try { return JSON.parse(localStorage.getItem(EDIT_STORE)) || { events: {}, dirty: false }; } catch { return { events: {}, dirty: false }; } };
  let state = read();
  state.events = state.events || {};
  state.todos = state.todos || {};
  state.stamps = state.stamps || {}; // Nir stamps: {id, page, s, x, y, r} plus one "clear:<page>" marker per cleared page

  // to-dos: base items from data/trip.json, plus per-item overrides and additions in state.todos
  // two lists share this store: "todo" (trip.toBook) and "packing" (trip.packing)
  const baseTodos = {}, baseGroups = { todo: [], packing: [] };
  [["todo", trip.toBook], ["packing", trip.packing]].forEach(([list, groups]) =>
    (groups || []).forEach((g) => {
      baseGroups[list].push(g.group);
      g.items.forEach((it, i) => (baseTodos[it.id] = { id: it.id, label: it.label, detail: it.detail || "", group: g.group, order: i, list }));
    }));
  const listOf = (o) => baseTodos[o.id]?.list || o.list || "todo";
  // one-time move of ticks saved by the older per-phone checklist
  try {
    const old = JSON.parse(localStorage.getItem("orlando-trip-checks-v1") || "null");
    if (old) {
      for (const id of Object.keys(old)) if (old[id] && baseTodos[id] && !state.todos[id]) state.todos[id] = { id, done: true, updatedAt: Date.now() };
      state.dirty = true;
      localStorage.removeItem("orlando-trip-checks-v1");
    }
  } catch { /* ignore */ }
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
  function touch(id, rec, kind = "events") {
    state[kind][id] = { ...rec, id, updatedAt: Date.now() };
    state.dirty = true;
    write();
    emit("local");
  }

  // ---- stamps (assets/stamp.js) ----
  const STAMP_CAP = 120; // per page; the oldest goes when a page is full, so the synced row stays small
  const clearedAt = (page) => state.stamps["clear:" + page]?.updatedAt || 0;
  const liveStamp = (o) => o && o.page && !o.clear && !o.gone && o.updatedAt > clearedAt(o.page);
  function pruneStamps() { // drop stamps (and tombstones) that a Clear already covers
    for (const [id, o] of Object.entries(state.stamps)) if (!o.clear && o.updatedAt <= clearedAt(o.page)) delete state.stamps[id];
  }
  function stampsFor(page) { return Object.values(state.stamps).filter((o) => o.page === page && liveStamp(o)).sort((a, b) => a.updatedAt - b.updatedAt); }
  function addStamp({ page, s: sticker, x, y, r }) {
    const live = stampsFor(page);
    if (live.length >= STAMP_CAP) state.stamps[live[0].id] = { id: live[0].id, page, gone: true, updatedAt: Date.now() };
    const id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    touch(id, { page, s: sticker, x, y, r }, "stamps");
    return state.stamps[id];
  }
  function clearStamps(page) {
    touch("clear:" + page, { page, clear: true }, "stamps");
    pruneStamps();
    write();
  }

  function todoGroups(list = "todo") {
    const items = [];
    for (const b of Object.values(baseTodos)) {
      if (b.list !== list) continue;
      const o = state.todos[b.id];
      if (o?.removed) continue;
      items.push({ ...b, ...(o ? { label: o.label ?? b.label, detail: o.detail ?? b.detail, group: o.group ?? b.group, done: !!o.done } : { done: false }) });
    }
    for (const o of Object.values(state.todos)) {
      if (baseTodos[o.id] || o.removed || !o.label || listOf(o) !== list) continue;
      items.push({ id: o.id, label: o.label, detail: o.detail || "", group: o.group || "Other", done: !!o.done, order: 1000 + (o.createdAt || 0) / 1e13 });
    }
    const extra = [...new Set(Object.values(state.todos).filter((o) => !baseTodos[o.id] && o.group && listOf(o) === list).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((o) => o.group))];
    const order = [...baseGroups[list], ...extra.filter((g) => !baseGroups[list].includes(g))];
    return order
      .map((group) => ({ group, items: items.filter((i) => i.group === group).sort((a, b) => a.order - b.order) }))
      .filter((g) => g.items.length);
  }
  return {
    eventsFor,
    isBase: (id) => !!base[id],
    allTags: () => [...new Set(trip.days.flatMap((d) => eventsFor(d.slug).flatMap((e) => e.tags || [])))],
    newId: uid,
    upsert: (ev) => touch(ev.id, { day: ev.day, ...pick(ev) }),
    remove: (ev) => touch(ev.id, { day: ev.day, deleted: true }),
    restore: (ev) => touch(ev.id, { day: ev.day, reset: true }),
    snapshot: () => ({ events: state.events, todos: state.todos, stamps: state.stamps }),
    stampsFor, addStamp, clearStamps,
    todoGroups,
    allGroups: (list = "todo") => [...new Set([...baseGroups[list], ...Object.values(state.todos).filter((o) => listOf(o) === list).map((o) => o.group).filter(Boolean)])],
    setDone: (id, done) => touch(id, { ...(state.todos[id] || {}), done }, "todos"),
    clearTodo: (id) => touch(id, { ...(state.todos[id] || {}), removed: true }, "todos"),
    addTodo: ({ label, detail, group, list = "todo" }) => touch(uid(), { label, detail, group, list, done: false, createdAt: Date.now() }, "todos"),
    isDirty: () => state.dirty,
    markClean() { state.dirty = false; write(); },
    // last write wins, per event
    mergeRemote(remote) {
      let changed = false, localNewer = false;
      for (const kind of ["events", "todos", "stamps"]) {
        const r = remote?.[kind] || {}, mine = state[kind];
        // stamps: take the Clear markers first, so stamps a Clear covers aren't brought back
        const entries = Object.entries(r).sort(([a], [b]) => (b.startsWith("clear:") ? 1 : 0) - (a.startsWith("clear:") ? 1 : 0));
        for (const [id, e] of entries) {
          if (kind === "stamps" && !e.clear && e.updatedAt <= clearedAt(e.page)) continue;
          if (!mine[id] || e.updatedAt > mine[id].updatedAt) { mine[id] = e; changed = true; }
        }
        if (kind === "stamps") pruneStamps();
        for (const [id, e] of Object.entries(mine)) if (!r[id] || e.updatedAt > r[id].updatedAt) localNewer = true;
      }
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
        const snap = store.snapshot();
        const { localNewer } = edits ? store.mergeRemote(edits) : { localNewer: Object.keys(snap.events).length + Object.keys(snap.todos).length + Object.keys(snap.stamps).length > 0 };
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
      try { grid.setPointerCapture(e.pointerId); } catch { /* ignore */ }
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
export const BUILTIN_TAGS = [["multi", "Multi Pass"], ["single", "Single Pass"], ["solo", "Jey solo"], ["booked", "Booked"], ["standby", "Standby"]];
const BUILTIN = new Set(BUILTIN_TAGS.map(([v]) => v));
const cleanTag = (t) => String(t).replace(/\s+/g, " ").trim().slice(0, 24);

// places: the day's known stops [{order, name, lat, lng, ...}]
// getPlaceSearch(): Promise<{ search(q) -> [{title, subtitle, pick() -> place}] } | null>
// A chosen place is either a known stop's order number or {name, lat, lng, placeId, address}.
export function openEditor({ ev, isNew, isBase, places, knownTags = [], getPlaceSearch, onSave, onDelete, onRestore }) {
  document.getElementById("editSheet")?.remove();
  const evTags = ev.tags || [];
  const custom = [...new Set([...knownTags, ...evTags].filter((t) => !BUILTIN.has(t)).map(cleanTag).filter(Boolean))];
  const chip = (v, l, cls, on) => `<label class="chip ${cls}"><input type="checkbox" name="tags" value="${esc(v)}" ${on ? "checked" : ""}><span>${esc(l)}</span></label>`;

  const dlg = document.createElement("dialog");
  dlg.id = "editSheet";
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "editTitle");
  dlg.innerHTML = `
    <form method="dialog" class="sheet-body" id="editForm" novalidate>
      <div class="sheet-top">
        <button type="button" class="sheet-x" id="editCancel" aria-label="Close">
          ${ph("x", 20)}
        </button>
        <h2 id="editTitle">${isNew ? "New event" : "Edit event"}</h2>
        <button type="submit" class="sheet-save">Save</button>
      </div>
      <label class="fld"><span class="label">Title</span>
        <input name="title" type="text" maxlength="140" value="${esc(ev.title)}" placeholder="Add title" autocomplete="off"></label>
      <div class="fld-row">
        <label class="fld"><span class="label">Starts</span><input name="start" type="time" step="300" value="${esc(ev.start)}"></label>
        <label class="fld"><span class="label">Ends</span><input name="end" type="time" step="300" value="${esc(ev.end)}"></label>
      </div>
      <p class="err" id="editErr" role="alert"></p>

      <div class="fld place-fld">
        <span class="label" id="plLabel">Location</span>
        <div class="place-picked" id="plPicked" hidden>
          ${ph("map-pin", 18)}
          <span class="pl-text"><b id="plName"></b><span id="plAddr"></span></span>
          <button type="button" class="pl-clear" id="plClear" aria-label="Remove location">
            ${ph("x", 16)}
          </button>
        </div>
        <div class="pl-box" id="plBox">
          <input id="plInput" type="search" role="combobox" aria-expanded="false" aria-controls="plList" aria-autocomplete="list"
            aria-labelledby="plLabel" placeholder="Search a place or address" autocomplete="off" enterkeyhint="search">
          <ul id="plList" role="listbox" class="pl-list" aria-label="Places" hidden></ul>
        </div>
        <p class="pl-hint" id="plHint"></p>
      </div>

      <label class="fld"><span class="label">Type</span>
        <select name="kind"><option value="">—</option>${KINDS.map(([v, l]) => `<option value="${v}" ${ev.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>

      <fieldset class="fld chips" id="tagChips"><legend class="label">Tags</legend>
        ${BUILTIN_TAGS.map(([v, l]) => chip(v, l, v, evTags.includes(v))).join("")}
        ${custom.map((t) => chip(t, t, "custom", evTags.includes(t))).join("")}
        <span class="tag-add">
          <input id="tagInput" type="text" maxlength="24" placeholder="New tag" aria-label="New tag name" autocomplete="off" enterkeyhint="done">
          <button type="button" id="tagAdd" aria-label="Add tag">Add</button>
        </span>
      </fieldset>
      <label class="fld"><span class="label">Note</span>
        <textarea name="note" rows="2" maxlength="500" placeholder="Add a note">${esc(ev.note || "")}</textarea></label>
      <div class="sheet-actions">
        ${isNew ? "" : `<button type="button" class="linkbtn danger" id="editDelete">Delete event</button>`}
        ${isBase && ev.edited ? `<button type="button" class="linkbtn" id="editRestore">Restore original</button>` : ""}
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const $ = (sel) => dlg.querySelector(sel);
  const form = $("form");
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  $("#editCancel").addEventListener("click", close);
  $("#editDelete")?.addEventListener("click", () => { if (confirm(`Delete “${ev.title}”?`)) { onDelete(ev); close(); } });
  $("#editRestore")?.addEventListener("click", () => { onRestore(ev); close(); });

  // ----- custom tags -----
  const addTag = () => {
    const input = $("#tagInput");
    const t = cleanTag(input.value);
    input.value = "";
    if (!t) return;
    const match = [...form.querySelectorAll('input[name="tags"]')].find((x) => x.value.toLowerCase() === t.toLowerCase()
      || x.nextElementSibling.textContent.toLowerCase() === t.toLowerCase());
    if (match) { match.checked = true; return; }
    $(".tag-add").insertAdjacentHTML("beforebegin", chip(t, t, "custom", true));
  };
  $("#tagAdd").addEventListener("click", addTag);
  $("#tagInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } });

  // ----- location combobox -----
  let chosen = ev.place ?? null;
  const knownBy = Object.fromEntries(places.map((p) => [p.order, p]));
  const input = $("#plInput"), list = $("#plList"), hint = $("#plHint");
  let items = [], active = -1, seq = 0, searchApi, timer;
  const showChosen = () => {
    const p = chosen == null ? null : typeof chosen === "object" ? chosen : knownBy[chosen];
    $("#plPicked").hidden = !p;
    $("#plBox").hidden = !!p;
    if (p) { $("#plName").textContent = p.name; $("#plAddr").textContent = p.address ? " · " + p.address : ""; }
  };
  const closeList = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
  const paint = () => {
    if (!items.length) { closeList(); return; }
    list.innerHTML = items.map((it, i) => it.header
      ? `<li class="pl-head" role="presentation">${esc(it.header)}</li>`
      : `<li role="option" id="pl-${i}" class="pl-opt${i === active ? " on" : ""}" aria-selected="${i === active}" data-i="${i}">
           <b>${esc(it.title)}</b>${it.subtitle ? `<span>${esc(it.subtitle)}</span>` : ""}</li>`).join("");
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", `pl-${active}`);
  };
  const choose = async (it) => {
    if (!it || it.header) return;
    closeList();
    if (it.order != null) { chosen = it.order; }
    else {
      hint.textContent = "Getting the place…";
      try { chosen = await it.pick(); hint.textContent = ""; }
      catch { hint.textContent = "Couldn't load that place. Try again."; return; }
    }
    input.value = "";
    showChosen();
  };
  async function search() {
    const q = input.value.trim(), mine = ++seq, ql = q.toLowerCase();
    const local = places.filter((p) => !ql || p.name.toLowerCase().includes(ql)).slice(0, 6)
      .map((p) => ({ title: p.name, subtitle: "On this day's plan", order: p.order }));
    items = local.length ? [{ header: "This day's places" }, ...local] : [];
    active = items.findIndex((x) => !x.header);
    paint();
    if (q.length < 2) { hint.textContent = ""; return; }
    try {
      searchApi = searchApi ?? (getPlaceSearch ? await getPlaceSearch() : null);
      if (!searchApi) { hint.textContent = "Place search needs Google Maps. Pick one of the day's places."; return; }
      const found = await searchApi.search(q);
      if (mine !== seq) return; // a newer keystroke won
      items = [...items, ...(found.length ? [{ header: "Google Maps" }, ...found] : [])];
      if (active < 0) active = items.findIndex((x) => !x.header);
      hint.textContent = found.length || local.length ? "" : "No places found.";
      paint();
    } catch {
      if (mine === seq) hint.textContent = "Place search isn't available right now. Pick one of the day's places.";
    }
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  input.addEventListener("focus", () => search());
  input.addEventListener("keydown", (e) => {
    const opts = items.map((x, i) => (x.header ? -1 : i)).filter((i) => i >= 0);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!opts.length) return;
      const pos = opts.indexOf(active);
      active = opts[(pos + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length];
      paint();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) choose(items[active]);
    } else if (e.key === "Escape" && !list.hidden) {
      e.preventDefault(); e.stopPropagation(); closeList();
    }
  });
  list.addEventListener("pointerdown", (e) => e.preventDefault()); // keep focus in the input
  list.addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) choose(items[Number(li.dataset.i)]); });
  input.addEventListener("blur", () => setTimeout(closeList, 150));
  $("#plClear").addEventListener("click", () => { chosen = null; showChosen(); input.focus(); });
  showChosen();

  // ----- save -----
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const title = String(f.get("title") || "").trim();
    const start = f.get("start"), endT = f.get("end");
    const err = $("#editErr");
    if (!title) { err.textContent = "Add a title."; return; }
    if (!start || !endT) { err.textContent = "Add a start and end time."; return; }
    if (toMin(endT) <= toMin(start)) { err.textContent = "End time has to be after the start."; return; }
    onSave({
      ...ev, title, start, end: endT,
      place: chosen,
      tags: [...new Set(f.getAll("tags").map(cleanTag).filter(Boolean))].slice(0, 8),
      kind: KINDS.some(([v]) => v === f.get("kind")) ? f.get("kind") : "",
      note: String(f.get("note") || "").trim(),
    });
    close();
  });
  dlg.showModal();
  if (isNew) $('input[name="title"]').focus();
}

// ---------- add to-do sheet ----------
export function openTodoSheet({ groups, defaultGroup, onSave, packing = false }) {
  document.getElementById("todoSheet")?.remove();
  const NEW = "__new__";
  const dlg = document.createElement("dialog");
  dlg.id = "todoSheet";
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "todoTitle");
  dlg.innerHTML = `
    <form method="dialog" class="sheet-body" novalidate>
      <div class="sheet-top">
        <button type="button" class="sheet-x" data-close aria-label="Close">
          ${ph("x", 20)}
        </button>
        <h2 id="todoTitle">${packing ? "Add to packing" : "New to-do"}</h2>
        <button type="submit" class="sheet-save">Add</button>
      </div>
      <label class="fld"><span class="label">${packing ? "Item" : "To-do"}</span>
        <input name="label" type="text" maxlength="120" placeholder="${packing ? "What to bring?" : "What needs doing?"}" autocomplete="off" enterkeyhint="done"></label>
      <label class="fld"><span class="label">Details (optional)</span>
        <input name="detail" type="text" maxlength="160" placeholder="${packing ? "How many, whose, notes…" : "Date, time, who, where…"}" autocomplete="off"></label>
      <label class="fld"><span class="label">Category</span>
        <select name="group">
          ${groups.map((g) => `<option value="${esc(g)}" ${g === defaultGroup ? "selected" : ""}>${esc(g)}</option>`).join("")}
          <option value="${NEW}">+ New category…</option>
        </select></label>
      <label class="fld" id="newGroupFld" hidden><span class="label">New category name</span>
        <input name="newGroup" type="text" maxlength="40" placeholder="e.g. Packing" autocomplete="off"></label>
      <p class="err" role="alert"></p>
    </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector("form");
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  dlg.querySelector("[data-close]").addEventListener("click", close);
  const sel = form.elements.group, newFld = dlg.querySelector("#newGroupFld");
  const syncNew = () => { newFld.hidden = sel.value !== NEW; if (!newFld.hidden) form.elements.newGroup.focus(); };
  sel.addEventListener("change", syncNew);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const label = form.elements.label.value.replace(/\s+/g, " ").trim();
    const detail = form.elements.detail.value.replace(/\s+/g, " ").trim();
    const group = sel.value === NEW ? form.elements.newGroup.value.replace(/\s+/g, " ").trim() : sel.value;
    const err = dlg.querySelector(".err");
    if (!label) { err.textContent = "Add what needs doing."; form.elements.label.focus(); return; }
    if (!group) { err.textContent = "Name the new category."; form.elements.newGroup.focus(); return; }
    onSave({ label, detail, group });
    close();
  });
  dlg.showModal();
  form.elements.label.focus();
}
