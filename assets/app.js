import { createStore, createSync, renderCalendar, openEditor, toMin, toHM, fmtClock, fmtRange, SYNC_TEXT } from "./edit.js";

// Orlando trip site. No build step: plain ES module.
// Optional /config.js (git-ignored) sets window.TRIP_CONFIG = { mapsKey, mapId, confirmations }.

const CFG = (window.TRIP_CONFIG = window.TRIP_CONFIG || {});
// Site root, wherever it is hosted (/, or /repo-name/ on GitHub Pages)
const BASE = new URL("../", import.meta.url).pathname;
const page = document.body.dataset.page;
const daySlug = document.body.dataset.day;
const app = document.getElementById("app");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const BADGE = { solo: "Jey solo", booked: "Booked", multi: "Multi Pass", single: "Single Pass", standby: "Standby" };
const tag = (cls, text) => `<span class="tag ${cls}">${esc(text)}</span>`;
const tagsFor = (tags = []) => (tags.length ? `<span class="tags">${tags.map((t) => tag(t, BADGE[t] || t)).join("")}</span>` : "");

const ICON = {
  chevronRight: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A9B4C4" stroke-width="1.8" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`,
  chevronUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>`,
  chevronDown: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2B3A52" stroke-width="1.8" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`,
  arrow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>`,
  clipboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" style="margin-bottom:2px"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12l2 2 4-4"/></svg>`,
};


// ---------- time (America/New_York) ----------
function nyNow() {
  const override = new URLSearchParams(location.search).get("now"); // e.g. ?now=2026-11-27T10:45
  if (override && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(override)) {
    const [date, hm] = override.split("T");
    return { date, hm };
  }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const longDate = (iso) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

// ---------- Google Maps deep link ----------
function mapsUrl(stop, park) {
  const u = new URL("https://www.google.com/maps/search/");
  u.searchParams.set("api", "1");
  if (stop.placeId) {
    u.searchParams.set("query", stop.name);
    u.searchParams.set("query_place_id", stop.placeId);
  } else if (stop.query) {
    u.searchParams.set("query", stop.query);
  } else if (stop.lat != null) {
    u.searchParams.set("query", `${stop.lat},${stop.lng}`);
  } else {
    u.searchParams.set("query", `${stop.name}, ${park}`);
  }
  return u.toString();
}

// ---------- checklist storage (shared by home drawer + bookings) ----------
const STORE = "orlando-trip-checks-v1";
function loadChecks() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function saveChecks(c) {
  try { localStorage.setItem(STORE, JSON.stringify(c)); } catch { /* private mode: ticks won't persist */ }
}
const allTodos = (trip) => trip.toBook.flatMap((g) => g.items);
const doneCount = (trip, c = loadChecks()) => allTodos(trip).filter((i) => c[i.id]).length;

function checklist(items, checks) {
  return `<ul class="check">${items
    .map(
      (i) => `<li><label><input type="checkbox" data-id="${esc(i.id)}" ${checks[i.id] ? "checked" : ""}>
      <span><span class="lt">${esc(i.label)}</span>${i.detail ? `<br><span class="muted">${esc(i.detail)}</span>` : ""}</span></label></li>`
    )
    .join("")}</ul>`;
}

function refreshProgress(trip) {
  const total = allTodos(trip).length;
  const done = doneCount(trip);
  const pct = Math.round((done / total) * 100);
  document.querySelectorAll("[data-progress-text]").forEach((el) => (el.textContent = `${done} of ${total} done`));
  document.querySelectorAll("[data-progress-bar]").forEach((el) => (el.style.width = pct + "%"));
  document.querySelectorAll("[data-group-count]").forEach((el) => {
    const g = trip.toBook.find((x) => x.group === el.dataset.groupCount);
    const c = loadChecks();
    el.textContent = `${g.items.filter((i) => c[i.id]).length} of ${g.items.length} done`;
  });
}

function wireChecks(trip) {
  document.addEventListener("change", (e) => {
    const box = e.target.closest("input[data-id]");
    if (!box) return;
    const c = loadChecks();
    if (box.checked) c[box.dataset.id] = true; else delete c[box.dataset.id];
    saveChecks(c);
    refreshProgress(trip);
  });
}

// ---------- chrome ----------
function tabbar(trip) {
  const short = { epcot: "EPCOT", "magic-kingdom": "Kingdom", "hollywood-studios": "Studios" };
  const tabs = [
    { href: BASE, key: "home", b: "Trip", sub: "Home" },
    ...trip.days.map((d) => ({ href: `${BASE}day/${d.slug}/`, key: d.slug, b: d.weekday, sub: short[d.slug] })),
    { href: BASE + "bookings/", key: "bookings", icon: ICON.clipboard, sub: "Bookings" },
  ];
  const cur = page === "day" ? daySlug : page;
  return `<nav class="tabbar" aria-label="Sections">${tabs
    .map((t) => `<a href="${t.href}" ${t.key === cur ? 'aria-current="page"' : ""}>${t.icon || `<b>${esc(t.b)}</b>`}${esc(t.sub)}</a>`)
    .join("")}</nav>`;
}

// ---------- home ----------
function renderHome(trip) {
  const { date } = nyNow();
  const toGo = daysBetween(date, trip.days[0].date);
  const countLine =
    toGo > 0 ? `<b>${toGo}</b><span>day${toGo === 1 ? "" : "s"} to go · ${esc(trip.crowdNote.replace(/^Thanksgiving weekend: /, "Thanksgiving weekend, "))}</span>`
    : toGo > -3 ? `<b>Today</b><span>The trip is on. ${esc(trip.crowdNote)}</span>`
    : `<span>Trip complete.</span>`;
  const checks = loadChecks();
  const total = allTodos(trip).length;
  const done = doneCount(trip, checks);
  return `
  <main>
    <header class="head">
      <div class="kicker">${esc(trip.travelers)} · Walt Disney World</div>
      <h1>Orlando,<br><span style="white-space:nowrap">November 27–29</span></h1>
      <div class="count">${countLine}</div>
    </header>

    <h2 class="label">Three park days</h2>
    <div class="rows">
      ${trip.days
        .map((d) => {
          const booked = d.stops.filter((s) => s.booked).length;
          const tags = [
            booked ? tag("booked", `${booked} booked`) : "",
            d.passes.single.some((p) => /both/.test(p)) ? tag("single", d.passes.single[0].replace(" (both)", " · both")) : "",
            tag("solo", `Jey: ${d.soloShort}`),
          ].join("");
          return `<a class="dayrow" href="${BASE}day/${d.slug}/">
            <span><span class="dow">${esc(d.weekday)}</span><span class="dnum">${Number(d.date.slice(8))}</span></span>
            <span>
              <span class="park">${esc(d.park)}</span>
              <span class="sum">${d.birthdayTag ? `<em>${esc(d.birthdayTag)}</em> ` : ""}${esc(d.summary)}</span>
              <span class="tags">${tags}</span>
            </span>
            ${ICON.chevronRight}
          </a>`;
        })
        .join("")}
    </div>

    <h2 class="label">Still open</h2>
    <div class="rows">
      ${trip.openItems
        .map((o) => `<div class="openrow"><span><b>${esc(o.label)}</b><span class="muted">${esc(o.detail)}</span></span>${tag("undecided", "Undecided")}</div>`)
        .join("")}
    </div>
  </main>

  <section class="drawer" id="drawer" aria-label="To-do list">
    <button type="button" class="drawer-handle" id="drawerToggle" aria-expanded="false" aria-controls="drawerBody">
      <span class="grip" aria-hidden="true"></span>
      <span class="line">
        <span class="title"><span>To do</span><span class="muted" data-progress-text>${done} of ${total} done</span></span>
        <span class="act"><span id="drawerAct">Open</span>${ICON.chevronUp}</span>
      </span>
      <span class="progress" aria-hidden="true"><span data-progress-bar style="width:${Math.round((done / total) * 100)}%"></span></span>
    </button>
    <div class="drawer-body" id="drawerBody">
      ${trip.toBook.map((g) => `<span class="label">${esc(g.group)}</span>${checklist(g.items, checks)}`).join("")}
      <p style="margin:16px 0 0"><a href="${BASE}bookings/" style="font-size:14px;font-weight:600">See all bookings and confirmations</a></p>
    </div>
  </section>`;
}

function wireHome() {
  const drawer = document.getElementById("drawer");
  const btn = document.getElementById("drawerToggle");
  const act = document.getElementById("drawerAct");
  let scrim;
  const set = (open) => {
    drawer.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    act.textContent = open ? "Close" : "Open";
    if (open && !scrim) {
      scrim = document.createElement("button");
      scrim.type = "button";
      scrim.className = "scrim";
      scrim.setAttribute("aria-label", "Close to-do list");
      scrim.addEventListener("click", () => set(false));
      document.body.appendChild(scrim);
    } else if (!open && scrim) {
      scrim.remove();
      scrim = null;
    }
  };
  btn.addEventListener("click", () => set(!drawer.classList.contains("open")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) set(false); });
}

// ---------- day ----------
let store = null, sync = null; // set in boot on day pages
const VIEW_STORE = "orlando-trip-view-v1";
const getView = () => { try { return localStorage.getItem(VIEW_STORE) === "cal" ? "cal" : "list"; } catch { return "list"; } };
const setView = (v) => { try { localStorage.setItem(VIEW_STORE, v); } catch { /* ignore */ } };
const timeHtml = (min) => { const t = fmtClock(min); const [hm, ap] = t.split(" "); return `${esc(hm)}<small>${ap}</small>`; };
const ICON_EDIT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>`;

// Map pins follow the (edited) schedule: every event with a place gets the next number.
function numbered(day, events) {
  const stopBy = Object.fromEntries(day.stops.map((s) => [s.order, s]));
  let n = 0;
  return events.map((ev) => {
    const stop = ev.place != null ? stopBy[ev.place] : null;
    return { ev, stop: stop && stop.lat != null ? stop : null, num: stop && stop.lat != null ? ++n : null };
  });
}

function nowNext(day, events) {
  const { date, hm } = nyNow();
  const now = toMin(hm);
  const at = (e) => esc(fmtClock(toMin(e.start), { withMeridiem: false }));
  if (!events.length) return { html: `<div><span class="label">Nothing planned</span><span class="val">Add something below.</span></div>`, single: true, cur: -1 };
  if (date < day.date) {
    const n = daysBetween(date, day.date);
    return { html: `<div><span class="label">In ${n} day${n === 1 ? "" : "s"} · starts ${esc(fmtClock(toMin(events[0].start)))}</span><span class="val">${esc(events[0].title)}</span></div>`, single: true, cur: -1 };
  }
  if (date > day.date) return { html: `<div><span class="label">Done</span><span class="val">This day is over.</span></div>`, single: true, cur: events.length };
  let cur = -1;
  events.forEach((e, i) => { if (toMin(e.start) <= now) cur = i; });
  const a = events[cur], b = events[cur + 1];
  return {
    html: `<div><span class="label">Now${a ? " · " + at(a) : ""}</span><span class="val">${a ? esc(a.title) : "Not started yet"}</span></div>
           <div><span class="label">Next${b ? " · " + at(b) : ""}</span><span class="val">${b ? esc(b.title) : "Done for the day"}</span></div>`,
    single: false,
    cur,
  };
}

function renderDay(trip, day) {
  const view = getView();
  return `
  <main>
    <header class="head">
      <div class="kicker">${esc(longDate(day.date))}</div>
      <h1>${esc(day.park)}</h1>
      ${day.birthdayLine ? `<p class="bday">${esc(day.birthdayLine)}</p>` : ""}
      <p class="lede">${esc(day.why)}</p>
    </header>

    <div class="stick" id="stick">
      <div class="nownext" id="nownext"></div>
      <div class="mapbox"><div id="map" role="region" aria-label="Map of the day's stops"></div></div>
    </div>
    <p class="mapnote" id="mapnote"></p>

    <ul class="passes">
      <li>${tag("multi", "Multi Pass")}<span>${day.passes.multi.map(esc).join(", ")}</span></li>
      <li>${tag("single", "Single Pass")}<span>${day.passes.single.map(esc).join(", ")}</span></li>
    </ul>
    ${day.note ? `<p class="note">${esc(day.note)}</p>` : ""}

    <div class="dayhead">
      <h2>The day</h2>
      <div class="seg" role="group" aria-label="View">
        <button type="button" data-view="list" aria-pressed="${view === "list"}">List</button>
        <button type="button" data-view="cal" aria-pressed="${view === "cal"}">Calendar</button>
      </div>
    </div>
    <div class="daytools">
      <span class="sync" id="syncStatus" aria-live="polite"></span>
      <button type="button" class="addbtn" id="addEv">+ Add</button>
    </div>
    <div id="dayBody"></div>
  </main>`;
}

function listHtml(day, items, cur) {
  return `<ol class="sched" id="sched">${items
    .map(({ ev, stop, num }, i) => {
      const cls = [num ? "stop" : "", i < cur ? "past" : "", i === cur ? "now" : ""].join(" ").trim();
      const tags = ev.tags || [];
      return `<li class="${cls}" data-id="${esc(ev.id)}">
        <div class="when"><span class="time">${timeHtml(toMin(ev.start))}</span>${num ? `<span class="num">${num}</span>` : ""}</div>
        <div class="body">
          ${tags.length || stop?.approx ? `<span class="tags">${tagsFor(tags)}${stop?.approx ? tag("approx", "Approx. pin") : ""}</span>` : ""}
          <div class="what">${esc(ev.title)}</div>
          <div class="where">${esc(fmtRange(toMin(ev.start), toMin(ev.end)))}${stop ? " · " + esc(stop.name) : ""}</div>
          ${ev.note ? `<div class="evnote">${esc(ev.note)}</div>` : ""}
          ${stop ? `<a class="dir" href="${esc(mapsUrl(stop, day.park))}" target="_blank" rel="noopener">Directions ${ICON.arrow}</a>` : ""}
        </div>
        <button type="button" class="editbtn" data-edit="${esc(ev.id)}" aria-label="Edit ${esc(ev.title)}">${ICON_EDIT}</button>
      </li>`;
    })
    .join("")}</ol>
    ${items.length ? "" : `<p class="muted" style="margin-top:12px">Nothing planned yet. Tap + Add.</p>`}`;
}

// selection shared by list rows, calendar and both map renderers (keyed by event id)
let mapApi = { highlight() {}, focus() {}, draw() {} };
function select(id, from) {
  document.querySelectorAll("#sched li.on").forEach((el) => el.classList.remove("on"));
  const li = document.querySelector(`#sched li[data-id="${CSS.escape(id)}"]`);
  if (li) li.classList.add("on");
  mapApi.highlight(id);
  if (from === "map" && li) {
    const stickH = document.getElementById("stick").getBoundingClientRect().height;
    window.scrollTo({ top: window.scrollY + li.getBoundingClientRect().top - stickH - 8, behavior: "smooth" });
  }
  if (from === "list") mapApi.focus(id);
}

function wireDay(day) {
  const body = document.getElementById("dayBody");
  const nn = document.getElementById("nownext");
  const note = document.getElementById("mapnote");
  const places = day.stops.filter((s) => s.lat != null);
  let items = [];

  const edit = (ev, isNew = false) =>
    openEditor({
      ev, isNew, isBase: store.isBase(ev.id), places,
      onSave: (e) => store.upsert(e),
      onDelete: (e) => store.remove(e),
      onRestore: (e) => store.restore(e),
    });
  const blank = (startMin) => ({ id: store.newId(), day: day.slug, title: "", start: toHM(startMin), end: toHM(Math.min(startMin + 60, 23 * 60 + 55)), place: null, tags: [], note: "" });

  function render() {
    const events = store.eventsFor(day.slug);
    items = numbered(day, events);
    const n = nowNext(day, events);
    nn.className = "nownext" + (n.single ? " single" : "");
    nn.innerHTML = n.html;
    const { date, hm } = nyNow();
    if (getView() === "cal") {
      body.innerHTML = `<div id="calBox"></div>`;
      renderCalendar(document.getElementById("calBox"), events, {
        today: date === day.date,
        nowMin: toMin(hm),
        placeLabel: (ev) => items.find((it) => it.ev.id === ev.id)?.num ?? null,
        onCreate: (min) => edit(blank(min), true),
        onOpen: (ev) => edit(ev),
        onMove: (ev, start, end) => store.upsert({ ...ev, start, end }),
      });
    } else {
      body.innerHTML = listHtml(day, items, n.cur);
    }
    const pins = items.filter((it) => it.num);
    const approx = pins.filter((p) => p.stop.approx).map((p) => p.num);
    const approxTxt =
      approx.length === 1 ? ` Pin ${approx[0]} is approximate.`
      : approx.length ? ` Pins ${approx.slice(0, -1).join(", ")} and ${approx.at(-1)} are approximate.` : "";
    note.textContent = (note.dataset.base || "") + approxTxt;
    mapApi.draw(pins);
  }

  document.querySelector(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-view]");
    if (!b) return;
    setView(b.dataset.view);
    document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  });
  document.getElementById("addEv").addEventListener("click", () => {
    const { date, hm } = nyNow();
    const evs = store.eventsFor(day.slug);
    const start = date === day.date ? Math.ceil(toMin(hm) / 30) * 30 : evs.length ? Math.ceil(toMin(evs.at(-1).end) / 30) * 30 : 12 * 60;
    edit(blank(Math.min(start, 23 * 60)), true);
  });
  body.addEventListener("click", (e) => {
    const eb = e.target.closest("[data-edit]");
    if (eb) { const ev = items.find((it) => it.ev.id === eb.dataset.edit)?.ev; if (ev) edit(ev); return; }
    if (e.target.closest("a")) return;
    const li = e.target.closest("#sched li.stop");
    if (li) select(li.dataset.id, "list");
  });

  const statusEl = document.getElementById("syncStatus");
  sync.onStatus((s) => { statusEl.textContent = SYNC_TEXT[s] || ""; statusEl.dataset.state = s; });
  store.onChange(() => render());

  if (CFG.mapsKey) {
    note.dataset.base = "Tap a pin or a row to match them up.";
    setupGoogle(day).then(render).catch(() => {
      note.dataset.base = "Google Maps didn't load, so this is a simple layout of the stops, north up.";
      setupSvg();
      render();
    });
    setupSvg(); // shows something right away; Google replaces it when ready
  } else {
    note.dataset.base = "A simple layout of the stops, north up. Use Directions to navigate.";
    setupSvg();
  }
  render();
}

// ---------- fallback map: SVG plot of the pins ----------
function setupSvg() {
  const box = document.getElementById("map");
  let last = [];
  mapApi = {
    draw(pins) {
      last = pins;
      if (!pins.length) { box.innerHTML = ""; return; }
      const W = box.clientWidth || 342, H = box.clientHeight || 240, pad = 26;
      const lat0 = pins.reduce((a, p) => a + p.stop.lat, 0) / pins.length;
      const k = Math.cos((lat0 * Math.PI) / 180);
      const xs = pins.map((p) => p.stop.lng * k), ys = pins.map((p) => p.stop.lat);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const scale = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
      const offX = (W - (maxX - minX) * scale) / 2, offY = (H - (maxY - minY) * scale) / 2;
      const pt = (s) => [offX + (s.lng * k - minX) * scale, offY + (maxY - s.lat) * scale];
      const path = pins.map((p, i) => `${i ? "L" : "M"}${pt(p.stop).map((v) => v.toFixed(1)).join(",")}`).join(" ");
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <path d="${path}" fill="none" stroke="#5A6A82" stroke-width="1.5" stroke-dasharray="4 4" stroke-linejoin="round"/>
        ${pins.map((p) => { const [x, y] = pt(p.stop); return `<g class="svgpin" data-id="${esc(p.ev.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="13"/><text>${p.num}</text></g>`; }).join("")}
      </svg>`;
      box.querySelector("svg").addEventListener("click", (e) => {
        const g = e.target.closest(".svgpin");
        if (g) select(g.dataset.id, "map");
      });
    },
    highlight(id) {
      box.querySelectorAll(".svgpin").forEach((g) => {
        const on = g.dataset.id === id;
        g.classList.toggle("on", on);
        if (on) g.parentNode.appendChild(g);
      });
    },
    focus() {},
  };
}

// ---------- Google Maps ----------
function loadGoogleScript() {
  if (window.google?.maps?.marker) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.__gmReady = resolve;
    window.gm_authFailure = () => reject(new Error("auth"));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CFG.mapsKey)}&v=weekly&libraries=marker&loading=async&callback=__gmReady`;
    s.async = true;
    s.onerror = () => reject(new Error("load"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("timeout")), 12000);
  });
}

async function setupGoogle(day) {
  await loadGoogleScript();
  const { Map, Polyline, LatLngBounds } = google.maps;
  const { AdvancedMarkerElement } = google.maps.marker;
  const el = document.getElementById("map");
  el.innerHTML = "";
  const map = new Map(el, {
    center: day.center, zoom: 16, mapId: CFG.mapId || "DEMO_MAP_ID",
    disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false,
  });
  const line = new Polyline({ map, path: [], strokeColor: "#0E1726", strokeOpacity: 0.65, strokeWeight: 3 });
  let markers = {}, fitted = "";
  mapApi = {
    draw(pins) {
      Object.values(markers).forEach(({ m }) => (m.map = null));
      markers = {};
      line.setPath(pins.map((p) => ({ lat: p.stop.lat, lng: p.stop.lng })));
      const bounds = new LatLngBounds();
      pins.forEach((p) => {
        const pin = document.createElement("div");
        pin.className = "gpin";
        pin.textContent = p.num;
        const m = new AdvancedMarkerElement({ map, position: { lat: p.stop.lat, lng: p.stop.lng }, content: pin, title: `${p.num}. ${p.stop.name}`, gmpClickable: true, zIndex: p.num });
        pin.addEventListener("click", (e) => { e.stopPropagation(); select(p.ev.id, "map"); });
        markers[p.ev.id] = { m, pin, num: p.num };
        bounds.extend({ lat: p.stop.lat, lng: p.stop.lng });
      });
      const key = pins.map((p) => p.stop.order).sort().join(",");
      if (pins.length && key !== fitted) { map.fitBounds(bounds, 36); fitted = key; } // refit only when the set of places changes
    },
    highlight(id) {
      Object.entries(markers).forEach(([k, { m, pin, num }]) => {
        const on = k === id;
        pin.classList.toggle("gon", on);
        m.zIndex = on ? 999 : num;
      });
    },
    focus(id) {
      const k = markers[id];
      if (k) map.panTo(k.m.position);
    },
  };
}

// ---------- bookings ----------
const OPEN_STORE = "orlando-trip-open-groups-v1";
function loadOpen() {
  try { return JSON.parse(localStorage.getItem(OPEN_STORE)) || null; } catch { return null; }
}

function renderBookings(trip) {
  const checks = loadChecks();
  const conf = CFG.confirmations || {};
  const total = allTodos(trip).length;
  const done = doneCount(trip, checks);
  const open = loadOpen() || { [trip.toBook[0].group]: true };
  return `
  <main>
    <header class="head">
      <div class="kicker">Bookings</div>
      <h1>Reservations<br>&amp; to-do</h1>
      <span class="muted" data-progress-text>${done} of ${total} done</span>
      <span class="progress" aria-hidden="true"><span data-progress-bar style="width:${Math.round((done / total) * 100)}%"></span></span>
    </header>

    <h2>Booked</h2>
    ${trip.booked
      .map(
        (b) => `<div class="booked-row">
          <div class="top"><b>${esc(b.what)}</b>${tag("booked", "Booked")}</div>
          <span class="muted">${esc(b.when)}</span>
          <span class="muted" style="font-size:13px">${conf[b.id] ? `Confirmation <span class="conf">${esc(conf[b.id])}</span>` : "Confirmation number is in the Disney app, under My Plans"}</span>
        </div>`
      )
      .join("")}

    <h2>To do</h2>
    ${trip.toBook
      .map((g) => {
        const gDone = g.items.filter((i) => checks[i.id]).length;
        return `<details class="group" data-group="${esc(g.group)}" ${open[g.group] ? "open" : ""}>
          <summary><span><b>${esc(g.group)}</b><span class="muted" data-group-count="${esc(g.group)}">${gDone} of ${g.items.length} done</span></span>${ICON.chevronDown}</summary>
          ${checklist(g.items, checks)}
        </details>`;
      })
      .join("")}
    <p class="muted" style="margin-top:16px;font-size:13px">Ticks are saved on this phone.</p>
    ${CFG.encrypted ? `<p style="margin-top:8px"><button type="button" class="linkbtn" id="lockNow">Lock this phone</button></p>` : ""}
  </main>`;
}

function wireBookings() {
  document.getElementById("lockNow")?.addEventListener("click", () => { forgetKey(); location.href = BASE; });
  document.querySelectorAll("details.group").forEach((d) =>
    d.addEventListener("toggle", () => {
      const state = {};
      document.querySelectorAll("details.group").forEach((x) => { if (x.open) state[x.dataset.group] = true; });
      try { localStorage.setItem(OPEN_STORE, JSON.stringify(state)); } catch { /* ignore */ }
    })
  );
}

// ---------- password lock (encrypted build for GitHub Pages) ----------
// data/trip.enc.json = PBKDF2-SHA256 -> 64 bytes: AES-256-CBC key + HMAC-SHA256 key (see scripts/build_pages.py)
const KEY_STORE = "orlando-trip-key-v1";
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64e = (u8) => btoa(String.fromCharCode(...u8));

async function deriveBits(password, blob) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64d(blob.salt), iterations: blob.iter }, base, 512);
  return new Uint8Array(bits);
}

async function decryptBlob(blob, bits) {
  const encKey = await crypto.subtle.importKey("raw", bits.slice(0, 32), { name: "AES-CBC" }, false, ["decrypt"]);
  const macKey = await crypto.subtle.importKey("raw", bits.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const iv = b64d(blob.iv), ct = b64d(blob.ct);
  const signed = new Uint8Array(iv.length + ct.length);
  signed.set(iv); signed.set(ct, iv.length);
  if (!(await crypto.subtle.verify("HMAC", macKey, b64d(blob.mac), signed))) throw new Error("wrong password");
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, encKey, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

// "Remember" keeps the key in localStorage; otherwise only for this browser session.
const savedKey = () => {
  try { const k = localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE); return k ? b64d(k) : null; } catch { return null; }
};
const saveKey = (bits, remember) => { try { (remember ? localStorage : sessionStorage).setItem(KEY_STORE, b64e(bits)); } catch { /* ignore */ } };
const forgetKey = () => { try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE); } catch { /* ignore */ } };

function renderLock(blob, onOpen) {
  app.innerHTML = `
  <main>
    <header class="head">
      <div class="kicker">Private trip</div>
      <h1>Orlando</h1>
      <p class="lede">Enter the password to see the plan.</p>
    </header>
    <form class="lock" id="lock" autocomplete="on">
      <label for="pw" class="label">Password</label>
      <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
      <label class="remember"><input type="checkbox" id="remember" checked> Remember on this phone</label>
      <button type="submit" id="go">Unlock</button>
      <p class="err" id="err" role="alert"></p>
    </form>
  </main>`;
  const form = document.getElementById("lock");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const go = document.getElementById("go"), err = document.getElementById("err");
    go.disabled = true; go.textContent = "Unlocking…"; err.textContent = "";
    try {
      const bits = await deriveBits(document.getElementById("pw").value, blob);
      const payload = await decryptBlob(blob, bits);
      saveKey(bits, document.getElementById("remember").checked);
      KEY_BITS = bits;
      onOpen(payload);
    } catch {
      err.textContent = "That password didn't work. Try again.";
      go.disabled = false; go.textContent = "Unlock";
    }
  });
}

let KEY_BITS = null; // derived from the password; also keys live sync
async function loadTrip() {
  if (!CFG.encrypted) {
    const plain = await fetch(BASE + "data/trip.json").catch(() => null);
    if (plain && plain.ok) return { trip: await plain.json() };
    CFG.encrypted = true; // no readable plan here: this is the encrypted build
  }
  const blob = await (await fetch(BASE + "data/trip.enc.json")).json();
  const key = savedKey();
  if (key) {
    try { const p = await decryptBlob(blob, key); KEY_BITS = key; return p; } catch { forgetKey(); } // password changed since
  }
  return new Promise((resolve) => renderLock(blob, resolve));
}

// ---------- boot ----------
async function boot() {
  let trip;
  try {
    const payload = await loadTrip();
    trip = payload.trip;
    Object.assign(CFG, payload.config || {});
  } catch {
    app.innerHTML = `<main><header class="head"><h1>Offline</h1><p class="lede">Couldn't load the trip plan. Open the site once with signal so it's saved for offline use.</p></header></main>`;
    return;
  }
  if (page === "home") { app.innerHTML = renderHome(trip); wireHome(); wireChecks(trip); }
  else if (page === "bookings") { app.innerHTML = renderBookings(trip); wireBookings(); wireChecks(trip); }
  else if (page === "day") {
    const day = trip.days.find((d) => d.slug === daySlug);
    document.title = `${day.park} · ${day.label}`;
    store = createStore(trip);
    sync = createSync(store, { bits: KEY_BITS, supabase: CFG.supabaseUrl ? { url: CFG.supabaseUrl, anonKey: CFG.supabaseAnonKey } : null });
    app.innerHTML = renderDay(trip, day);
    wireDay(day);
  }
  app.insertAdjacentHTML("beforeend", tabbar(trip));
}
boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(BASE + "sw.js").catch(() => {}));
}
