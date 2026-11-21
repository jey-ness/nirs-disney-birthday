import { createStore, createSync, renderCalendar, openEditor, openTodoSheet, toMin, toHM, fmtClock, fmtRange, SYNC_TEXT } from "./edit.js";
import { EXPLORE } from "./explore.js";
import { loadForecast, dayLine, dayDetail, packingAlerts, alertHtml, CREDIT } from "./weather.js";
import { initStamps, DAY_STICKER } from "./stamp.js";

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
// Known tag styles get their color; anything else (custom tags) is a neutral pill. Never put user text in class.
const TAG_CLASSES = new Set(["solo", "booked", "multi", "single", "standby", "approx", "undecided"]);
const tag = (cls, text) => `<span class="tag ${TAG_CLASSES.has(cls) ? cls : "custom"}">${esc(text)}</span>`;
const tagsFor = (tags = []) => (tags.length ? `<span class="tags">${tags.map((t) => tag(t, BADGE[t] || t)).join("")}</span>` : "");

const ICON = {
  chevronRight: `<svg class="chevron-r" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" style="color:var(--ink-300)"><path d="M9 6l6 6-6 6"/></svg>`,
  chevronUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>`,
  chevronDown: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" style="color:var(--ink-700)"><path d="M6 9l6 6 6-6"/></svg>`,
  arrow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>`,
  home: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" style="margin-bottom:2px"><path d="M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/></svg>`,
  menu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true" style="margin-bottom:2px"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
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

// ---------- theme: Light / Dark / Magic (design canvas "Orlando trip site design") ----------
// assets/theme.js applies a saved choice before paint; with none saved the phone's setting decides.
const THEME_STORE = "orlando-trip-theme-v1";
const THEMES = ["light", "dark", "magic"];
function savedTheme() { try { const m = localStorage.getItem(THEME_STORE); return THEMES.includes(m) ? m : null; } catch { return null; } }
function effectiveTheme() { return savedTheme() || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
function setTheme(mode) {
  try { mode ? localStorage.setItem(THEME_STORE, mode) : localStorage.removeItem(THEME_STORE); } catch { /* private mode */ }
  if (mode) document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme;
  const eff = effectiveTheme();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", eff === "magic" ? "#120B2E" : eff === "dark" ? "#0B111C" : "#ffffff");
}
// twinkling stars for Magic mode (hidden by CSS in the other themes; still when reduced motion is on)
const STARS = `<div class="stars" aria-hidden="true"><svg width="390" height="230" viewBox="0 0 390 230">
  <circle cx="40" cy="30" r="1.2" fill="#FFF7E0" opacity=".6"/><circle cx="120" cy="18" r="1" fill="#FFF7E0" opacity=".5"/><circle cx="210" cy="40" r="1.4" fill="#FFF7E0" opacity=".7"/><circle cx="300" cy="22" r="1" fill="#FFF7E0" opacity=".5"/><circle cx="365" cy="60" r="1.2" fill="#FFF7E0" opacity=".6"/><circle cx="250" cy="110" r="1" fill="#FFF7E0" opacity=".4"/><circle cx="160" cy="70" r=".9" fill="#FFF7E0" opacity=".5"/>
  <path class="tw" d="M330 36 L333 46 L343 49 L333 52 L330 62 L327 52 L317 49 L327 46 Z" fill="#F4D58D"/>
  <path class="tw tw2" d="M268 78 L270 84 L276 86 L270 88 L268 94 L266 88 L260 86 L266 84 Z" fill="#FFF7E0"/>
  <path class="tw tw3" d="M360 118 L362 123 L367 125 L362 127 L360 132 L358 127 L353 125 L358 123 Z" fill="#E9B8F0"/>
  <path class="tw tw4" d="M86 22 L88 27 L93 29 L88 31 L86 36 L84 31 L79 29 L84 27 Z" fill="#F4D58D"/>
</svg></div>`;

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

// ---------- to-do list (home drawer + bookings; saved on the phone and synced via the store) ----------
const OPEN_STORE = "orlando-trip-open-groups-v1";
const loadOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_STORE)) || null; } catch { return null; } };
const saveOpen = (o) => { try { localStorage.setItem(OPEN_STORE, JSON.stringify(o)); } catch { /* ignore */ } };
let lastGroup = null;

function todoItemsHtml(items) {
  return `<ul class="check">${items
    .map((i) => `<li class="${i.done ? "done" : ""}">
      <label><input type="checkbox" data-todo="${esc(i.id)}" ${i.done ? "checked" : ""}>
        <span><span class="lt">${esc(i.label)}</span>${i.detail ? `<br><span class="muted">${esc(i.detail)}</span>` : ""}</span></label>
      ${i.done ? `<button type="button" class="clearbtn" data-clear="${esc(i.id)}" aria-label="Clear ${esc(i.label)} from the list">Clear</button>` : ""}
    </li>`)
    .join("")}</ul>`;
}

function renderTodos(mode) {
  const box = document.getElementById("todoBox");
  if (!box) return;
  const groups = store.todoGroups();
  const empty = `<p class="muted" style="margin:12px 0">Nothing left to do. Add something with + Add.</p>`;
  if (mode === "drawer") {
    box.innerHTML = groups.map((g) => `<span class="label">${esc(g.group)}</span>${todoItemsHtml(g.items)}`).join("") || empty;
  } else {
    const open = loadOpen() || (groups[0] ? { [groups[0].group]: true } : {});
    box.innerHTML = groups
      .map((g) => `<details class="group" data-group="${esc(g.group)}" ${open[g.group] ? "open" : ""}>
        <summary><span><b>${esc(g.group)}</b><span class="muted">${g.items.filter((i) => i.done).length} of ${g.items.length} done</span></span>${ICON.chevronDown}</summary>
        ${todoItemsHtml(g.items)}
      </details>`)
      .join("") || empty;
  }
  const all = groups.flatMap((g) => g.items), done = all.filter((i) => i.done).length;
  document.querySelectorAll("[data-progress-text]").forEach((el) => (el.textContent = `${done} of ${all.length} done`));
  document.querySelectorAll("[data-progress-bar]").forEach((el) => (el.style.width = (all.length ? Math.round((done / all.length) * 100) : 0) + "%"));
}

function renderPacking() {
  const box = document.getElementById("packBox");
  if (!box) return;
  const groups = store.todoGroups("packing");
  const open = loadOpen() || {};
  box.innerHTML = groups
    .map((g) => `<details class="group" data-group="${esc(g.group)}" ${open[g.group] ? "open" : ""}>
      <summary><span><b>${esc(g.group)}</b><span class="muted">${g.items.filter((i) => i.done).length} of ${g.items.length} packed</span></span>${ICON.chevronDown}</summary>
      ${todoItemsHtml(g.items)}
    </details>`)
    .join("") || `<p class="muted" style="margin:12px 0">Nothing on the list. Add something with + Add.</p>`;
}

function wireTodos(mode) {
  document.addEventListener("change", (e) => {
    const box = e.target.closest("input[data-todo]");
    if (box) store.setDone(box.dataset.todo, box.checked);
  });
  document.addEventListener("click", (e) => {
    const clear = e.target.closest("[data-clear]");
    if (clear) { store.clearTodo(clear.dataset.clear); return; }
    if (e.target.closest("[data-add-pack]")) {
      const groups = store.allGroups("packing");
      openTodoSheet({
        groups, defaultGroup: groups[0], packing: true,
        onSave: (t) => {
          const open = loadOpen() || {};
          open[t.group] = true;
          saveOpen(open);
          store.addTodo({ ...t, list: "packing" });
        },
      });
      return;
    }
    if (e.target.closest("[data-add-todo]")) {
      const groups = store.allGroups();
      openTodoSheet({
        groups, defaultGroup: lastGroup || groups[0],
        onSave: (t) => {
          lastGroup = t.group;
          const open = loadOpen() || {};
          open[t.group] = true; // show the category the new item landed in
          saveOpen(open);
          store.addTodo(t);
        },
      });
    }
  });
  // remember which categories are open (toggle doesn't bubble, so listen in the capture phase)
  document.addEventListener("toggle", (e) => {
    if (!e.target.matches?.("details.group")) return;
    const open = {};
    document.querySelectorAll("details.group").forEach((x) => { if (x.open) open[x.dataset.group] = true; });
    saveOpen(open);
  }, true);
  const statusEl = document.getElementById("syncStatus");
  if (statusEl) sync.onStatus((st) => { statusEl.textContent = SYNC_TEXT[st] || ""; statusEl.dataset.state = st; });
  store.onChange(() => { renderTodos(mode); renderPacking(); });
  renderTodos(mode);
  renderPacking();
}

// ---------- chrome ----------
function tabbar(trip) {
  const short = { epcot: "EPCOT", "magic-kingdom": "Kingdom", "hollywood-studios": "Studios" };
  const tabs = [
    { href: BASE, key: "home", icon: ICON.home, sub: "Home" },
    ...trip.days.map((d) => ({
      href: `${BASE}day/${d.slug}/`, key: d.slug, sub: short[d.slug],
      b: `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}`, // 11/27
    })),
    { href: BASE + "menu/", key: "menu", icon: ICON.menu, sub: "Menu" },
  ];
  const cur = page === "day" ? daySlug : page === "bookings" ? "menu" : page;
  return `<nav class="tabbar" aria-label="Sections">${tabs
    .map((t) => `<a href="${t.href}" ${t.key === cur ? 'aria-current="page"' : ""}>${t.icon || `<b>${esc(t.b)}</b>`}${esc(t.sub)}</a>`)
    .join("")}</nav>`;
}

// ---------- home ----------
function renderHome(trip) {
  const { date } = nyNow();
  const toGo = daysBetween(date, trip.days[0].date);
  const countLine =
    toGo > 0 ? `<b>${toGo}</b> <span>day${toGo === 1 ? "" : "s"} to go · ${esc(trip.crowdNote.replace(/^Thanksgiving weekend: /, "Thanksgiving weekend, "))}</span>`
    : toGo > -3 ? `<b>Today.</b> <span>The trip is on. ${esc(trip.crowdNote)}</span>`
    : `<span>Trip complete.</span>`;
  return `
  <main>
    <header class="head">
      <div class="kicker">${esc(trip.travelers)} · Walt Disney World</div>
      <h1>Orlando,<br><span style="white-space:nowrap">November 27–29</span></h1>
      <div class="count">${countLine}</div>
    </header>
    <div id="wxAlert"></div>

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
              ${d.hours ? `<span class="hours">Open ${esc(d.hours)}</span>` : ""}
              <span class="wx" data-wx="${esc(d.date)}"></span>
              <span class="sum">${d.birthdayTag ? `<em>${esc(d.birthdayTag)}</em> ` : ""}${esc(d.summary)}</span>
              <span class="tags">${tags}</span>
            </span>
            ${ICON.chevronRight}
          </a>`;
        })
        .join("")}
    </div>

    ${trip.flights?.length ? `
    <h2 class="label">Flights</h2>
    <div class="rows">
      ${trip.flights.map((f) => `<div class="flight">
        <span class="fl-day"><span class="dow">${esc(f.label)}</span><span class="fl-date">${esc(f.day.replace(/^\w+ /, ""))}</span></span>
        <span class="fl-main">
          <span class="fl-times serif">${esc(f.dep)} <span aria-hidden="true">→</span><span class="sr-only"> to </span> ${esc(f.arr)}</span>
          <span class="muted">${esc(f.from)} → ${esc(f.to)} · ${esc(f.flight)} · ${esc(f.duration)} · ${esc(f.day.split(" ")[0])}</span>
        </span>
      </div>`).join("")}
    </div>` : ""}

    ${trip.stay ? `
    <h2 class="label">Staying at</h2>
    <div class="rows">
      <div class="stay">
        <span class="stay-name serif">${esc(trip.stay.name)}</span>
        <span class="muted">${esc(trip.stay.address)}</span>
        ${trip.stay.note ? `<span class="muted">${esc(trip.stay.note)}</span>` : ""}
        <a class="dir" href="${esc(mapsUrl({ name: trip.stay.name, query: trip.stay.query || trip.stay.name }, ""))}" target="_blank" rel="noopener">Directions ${ICON.arrow}</a>
      </div>
    </div>` : ""}

    <h2 class="label">Still open</h2>
    <div class="rows">
      ${trip.openItems
        .map((o) => `<div class="openrow"><span><b>${esc(o.label)}</b><span class="muted">${esc(o.detail)}</span></span>${tag("undecided", o.status || "Undecided")}</div>`)
        .join("")}
    </div>
  </main>

  <section class="drawer" id="drawer" aria-label="To-do list">
    <button type="button" class="drawer-handle" id="drawerToggle" aria-expanded="false" aria-controls="drawerBody">
      <span class="grip" aria-hidden="true"></span>
      <span class="line">
        <span class="title"><span>To do</span><span class="muted" data-progress-text></span></span>
        <span class="act"><span id="drawerAct">Open</span>${ICON.chevronUp}</span>
      </span>
      <span class="progress" aria-hidden="true"><span data-progress-bar></span></span>
    </button>
    <div class="drawer-body" id="drawerBody">
      <div class="todo-tools"><span class="sync" id="syncStatus" aria-live="polite"></span><button type="button" class="addbtn" data-add-todo>+ Add</button></div>
      <div id="todoBox"></div>
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
let STICKERS = []; // Nir stickers, from the decrypted bundle
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
    // place is a known stop's number, or a place picked from Google search {name, lat, lng, placeId, address}
    const stop = ev.place == null ? null : typeof ev.place === "object" ? ev.place : stopBy[ev.place];
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
      <div class="headrow">
        ${(() => { const st = STICKERS.find((x) => x.id === DAY_STICKER[day.slug]); return st ? `<img class="headnir" src="${st.src}" alt="${esc(st.label)} Nir">` : ""; })()}
        <div class="headtxt">
          <div class="kicker">${esc(longDate(day.date))}${day.hours ? ` · Open ${esc(day.hours)}` : ""}</div>
          <h1 class="dayh1">${esc(day.park)}</h1>
        </div>
      </div>
      ${day.birthdayLine ? `<p class="bday">${esc(day.birthdayLine)}</p>` : ""}
      <p class="lede">${esc(day.why)}</p>
      <div class="wxday" data-wx-day="${esc(day.date)}"></div>
    </header>

    <div class="nownext" id="nownext"></div>
    <div class="stick" id="stick">
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
    ${exploreHtml(day)}
  </main>`;
}

function exploreHtml(day) {
  const list = EXPLORE[day.slug] || [];
  if (!list.length) return "";
  const levelTag = (l) => (l === "thrill" ? tag("solo", "Thrill") : l === "moderate" ? tag("custom", "Moderate") : "");
  return `<details class="explore" id="explore">
    <summary><span><b class="serif">Explore more</b><span class="muted">${list.length} other things to do in ${esc(day.park)}</span></span>${ICON.chevronDown}</summary>
    <p class="muted" style="margin:0 0 4px;font-size:13px">Not in the plan yet. Check the Disney app for closures and show times.</p>
    <ul class="xlist">${list
      .map((x, i) => `<li>
        <div class="xmain">
          <span class="xname">${esc(x.name)}</span>
          <span class="muted">${esc(x.area)} · ${esc(x.kind)}${x.note ? " · " + esc(x.note) : ""}</span>
          ${levelTag(x.level) ? `<span class="tags">${levelTag(x.level)}</span>` : ""}
        </div>
        <div class="xact">
          <button type="button" class="addbtn small" data-plan="${i}" aria-label="Add ${esc(x.name)} to the plan">+ Plan</button>
          <a class="dir" href="${esc(mapsUrl({ name: x.name, query: `${x.name}, ${day.park}, Walt Disney World` }, day.park))}" target="_blank" rel="noopener" aria-label="${esc(x.name)} in Google Maps">Map ${ICON.arrow}</a>
        </div>
      </li>`)
      .join("")}</ul>
  </details>`;
}

// Rough walking estimate between two pins: straight line × 1.35 for paths, ~75 m/min with crowds.
function walkBetween(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h)) * 1.35;
  return { m, min: Math.max(2, Math.round(m / 75)) };
}

function walkHtml(prev, cur) {
  if (!prev || !cur.stop) return "";
  const w = walkBetween(prev.stop, cur.stop);
  if (w.m < 60) return "";
  if (w.m > 2500) return `<li class="walk"><span></span><span class="wtxt">Bus, monorail or car to the next stop</span></li>`;
  const dist = w.m < 950 ? `${Math.round(w.m / 50) * 50} m` : `${(w.m / 1000).toFixed(1)} km`;
  return `<li class="walk"><span></span><span class="wtxt">≈ ${w.min} min walk · ${dist}</span></li>`;
}

function listHtml(day, items, cur) {
  let prev = null;
  return `<ol class="sched" id="sched">${items
    .map((item, i) => {
      const { ev, stop, num } = item;
      const walk = walkHtml(prev, item);
      if (stop) prev = item;
      const cls = [num ? "stop" : "", i < cur ? "past" : "", i === cur ? "now" : ""].join(" ").trim();
      const tags = ev.tags || [];
      return `${walk}<li class="${cls}" data-id="${esc(ev.id)}">
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
      knownTags: store.allTags(),
      getPlaceSearch: () => placeSearch(day),
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
    const live = n.cur >= 0 && n.cur < items.length; // only today: dim what's done, ring what's on now
    const pins = items
      .map((it, i) => ({ ...it, state: !live ? "" : i < n.cur ? "past" : i === n.cur ? "now" : "" }))
      .filter((it) => it.num);
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

  document.getElementById("explore")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-plan]");
    if (!b) return;
    const x = EXPLORE[day.slug][Number(b.dataset.plan)];
    const evs = store.eventsFor(day.slug);
    const start = evs.length ? Math.min(Math.ceil(toMin(evs.at(-1).end) / 30) * 30, 22 * 60) : 12 * 60;
    edit({ ...blank(start), title: x.name, note: x.note || "" }, true);
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
        <path d="${path}" fill="none" style="stroke:var(--ink-500)" stroke-width="1.5" stroke-dasharray="4 4" stroke-linejoin="round"/>
        ${pins.map((p) => { const [x, y] = pt(p.stop); return `<g class="svgpin${p.state ? " " + p.state : ""}" data-id="${esc(p.ev.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">${p.state === "now" ? `<circle class="halo" r="20"/>` : ""}<circle r="13"/><text>${p.num}</text></g>`; }).join("")}
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

// Google Places autocomplete for the editor's Location field, biased to the day's park.
let placeSearchP = null;
function placeSearch(day) {
  if (!CFG.mapsKey) return Promise.resolve(null);
  placeSearchP = placeSearchP || (async () => {
    await loadGoogleScript();
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary("places");
    let token = new AutocompleteSessionToken(); // groups keystrokes + the final pick into one billed session
    return {
      async search(q) {
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q, sessionToken: token, locationBias: { center: day.center, radius: 4000 },
        });
        return suggestions.filter((x) => x.placePrediction).slice(0, 6).map(({ placePrediction: p }) => ({
          title: p.mainText?.text || p.text.text,
          subtitle: p.secondaryText?.text || "",
          async pick() {
            const place = p.toPlace();
            await place.fetchFields({ fields: ["displayName", "location", "formattedAddress"] });
            token = new AutocompleteSessionToken();
            return { name: place.displayName, lat: place.location.lat(), lng: place.location.lng(), placeId: place.id, address: place.formattedAddress || "" };
          },
        }));
      },
    };
  })().catch((e) => { placeSearchP = null; throw e; });
  return placeSearchP;
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
    colorScheme: effectiveTheme() === "light" ? "LIGHT" : "DARK", // dark map at night so it doesn't glare
  });
  const lineColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0E1726";
  // Dashed route, like the design's walking line, so it reads as "the way between stops".
  const line = new Polyline({ map, path: [], strokeOpacity: 0, icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: lineColor, strokeOpacity: 0.85, strokeWeight: 3, scale: 2.5 }, offset: "0", repeat: "12px" }] });
  let markers = {}, fitted = "";
  mapApi = {
    draw(pins) {
      Object.values(markers).forEach(({ m }) => (m.map = null));
      markers = {};
      line.setPath(pins.map((p) => ({ lat: p.stop.lat, lng: p.stop.lng })));
      const bounds = new LatLngBounds();
      pins.forEach((p) => {
        const pin = document.createElement("div");
        pin.className = "gpin" + (p.state ? " " + p.state : "");
        pin.innerHTML = `<span>${p.num}</span>`;
        const m = new AdvancedMarkerElement({ map, position: { lat: p.stop.lat, lng: p.stop.lng }, content: pin, title: `${p.num}. ${p.stop.name}`, gmpClickable: true, zIndex: p.state === "now" ? 500 : p.state === "past" ? p.num : 100 + p.num });
        pin.addEventListener("click", (e) => { e.stopPropagation(); select(p.ev.id, "map"); });
        markers[p.ev.id] = { m, pin, num: p.num };
        bounds.extend({ lat: p.stop.lat, lng: p.stop.lng });
      });
      const key = pins.map((p) => `${p.stop.lat},${p.stop.lng}`).sort().join("|");
      if (pins.length && key !== fitted) { map.fitBounds(bounds, 36); fitted = key; } // refit only when the set of places changes
    },
    highlight(id) {
      Object.entries(markers).forEach(([k, { m, pin, num }]) => {
        const on = k === id;
        pin.classList.toggle("gon", on);
        m.zIndex = on ? 999 : pin.classList.contains("now") ? 500 : pin.classList.contains("past") ? num : 100 + num;
      });
    },
    focus(id) {
      const k = markers[id];
      if (k) map.panTo(k.m.position);
    },
  };
}

// ---------- menu ----------
const MI = {
  todo: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>`,
  bookings: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/></svg>`,
  packing: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M5 12h14"/></svg>`,
  weather: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="3"/><path d="M9 2v1.5M2 9h1.5M4 4l1 1M14 4l-1 1"/><path d="M8 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4 1.6A2.8 2.8 0 0 0 8 19z"/></svg>`,
  hours: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>`,
  around: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>`,
  sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  moon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
  sparkle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/></svg>`,
};
const CHEV = `<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
const NIGHT_TAGS = ["Fireworks", "Night show"];

function themeSegHtml() {
  const cur = effectiveTheme();
  const opts = [["light", "Light", MI.sun], ["dark", "Dark", MI.moon], ["magic", "Magic", MI.sparkle]];
  return `<div class="themeseg" role="group" aria-label="Appearance">${opts
    .map(([id, label, icon]) => `<button type="button" data-theme-pick="${id}" aria-pressed="${cur === id}">${icon}${label}</button>`)
    .join("")}</div>
    <p class="themenote">${savedTheme() ? `Saved on this phone. <button type="button" data-theme-pick="">Match the phone's setting</button>` : "Following the phone's light or dark setting."}</p>`;
}

function renderMenu(trip) {
  const dates = [...new Set([...(trip.flights || []).map((f) => f.date), ...trip.days.map((d) => d.date)])].sort();
  const dayName = (date) => {
    const d = trip.days.find((x) => x.date === date), f = (trip.flights || []).find((x) => x.date === date);
    const wd = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    return `${wd} ${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}${d ? " · " + d.park : f ? (f.id === "out" ? " · arrival" : " · flight home") : ""}`;
  };
  const stay = trip.stay;
  return `
  <main>
    <header class="head">
      <div class="kicker">Trip</div>
      <h1>Menu</h1>
    </header>

    <h2 class="label" style="margin-top:28px">Appearance</h2>
    <div id="themeBox">${themeSegHtml()}</div>

    <h2 class="label" style="margin-top:28px">Plan</h2>
    <div class="menu-list">
      <a class="menu-row" href="${BASE}bookings/#todo"><span class="ic">${MI.todo}</span>
        <span class="txt"><b>To do</b><span class="muted" id="mTodo"></span><span class="progress" aria-hidden="true"><span id="mTodoBar"></span></span></span>${CHEV}</a>
      <a class="menu-row" href="${BASE}bookings/"><span class="ic">${MI.bookings}</span>
        <span class="txt"><b>Bookings</b><span class="muted">${trip.booked.length} reservations, with confirmation numbers</span></span>${CHEV}</a>
      <a class="menu-row" href="${BASE}bookings/#packing"><span class="ic">${MI.packing}</span>
        <span class="txt"><b>Packing</b><span class="muted" id="mPack"></span></span>${CHEV}</a>

      <details class="menu-more">
        <summary class="menu-row"><span class="ic">${MI.weather}</span>
          <span class="txt"><b>Weather</b><span class="muted">Forecast for each day of the trip, in °C</span></span>${CHEV}</summary>
        <div class="menu-body">
          <div id="wxAlertMenu"></div>
          ${dates.map((dt) => `<div class="line"><b>${esc(dayName(dt))}</b><span class="wx" data-wx="${esc(dt)}"><span class="muted">Forecast not available yet</span></span></div>`).join("")}
          <span class="muted" style="font-size:12px">${CREDIT}</span>
        </div>
      </details>

      <details class="menu-more">
        <summary class="menu-row"><span class="ic">${MI.hours}</span>
          <span class="txt"><b>Park hours</b><span class="muted">Opening, closing and fireworks times</span></span>${CHEV}</summary>
        <div class="menu-body" id="mHours"></div>
      </details>

      <details class="menu-more">
        <summary class="menu-row" style="border-bottom:0"><span class="ic">${MI.around}</span>
          <span class="txt"><b>Getting around</b><span class="muted">Hotel, transport and park addresses</span></span>${CHEV}</summary>
        <div class="menu-body">
          ${stay ? `<div class="line"><b>${esc(stay.name)}</b><span class="muted">${esc(stay.address)}</span><span class="muted">${esc(stay.note || "")}</span>
            <a class="dir" href="${esc(mapsUrl({ name: stay.name, query: stay.query || stay.address }, ""))}" target="_blank" rel="noopener">Directions ${ICON.arrow}</a></div>` : ""}
          ${trip.days.map((d) => `<div class="line"><b>${esc(d.park)}</b><span class="muted">${esc(longDate(d.date))}</span>
            <a class="dir" href="${esc(mapsUrl({ name: d.park, query: d.park + ", Walt Disney World" }, d.park))}" target="_blank" rel="noopener">Directions ${ICON.arrow}</a></div>`).join("")}
          ${(trip.flights || []).map((f) => `<div class="line"><b>${esc(f.label)}: ${esc(f.from)} → ${esc(f.to)}</b><span class="muted">${esc(f.day)} · ${esc(f.dep)} → ${esc(f.arr)} · ${esc(f.flight)}</span></div>`).join("")}
        </div>
      </details>
    </div>
    ${CFG.encrypted ? `<p style="margin-top:24px"><button type="button" class="linkbtn" id="lockNow">Lock this phone</button></p>` : ""}
  </main>`;
}

function wireMenu(trip) {
  const counts = () => {
    const todo = store.todoGroups().flatMap((g) => g.items), pack = store.todoGroups("packing").flatMap((g) => g.items);
    const td = todo.filter((i) => i.done).length, pk = pack.filter((i) => i.done).length;
    document.getElementById("mTodo").textContent = `${td} of ${todo.length} done`;
    document.getElementById("mTodoBar").style.width = (todo.length ? Math.round((td / todo.length) * 100) : 0) + "%";
    document.getElementById("mPack").textContent = `${pk} of ${pack.length} packed`;
    document.getElementById("mHours").innerHTML = trip.days.map((d) => {
      const shows = store.eventsFor(d.slug).filter((e) => (e.tags || []).some((t) => NIGHT_TAGS.includes(t)));
      return `<div class="line"><b>${esc(new Date(d.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" }))} · ${esc(d.park)}</b>
        <span>Open ${esc(d.hours || "")}</span>
        ${shows.map((e) => `<span class="muted">${esc(fmtClock(toMin(e.start)))} · ${esc(e.title)}</span>`).join("")}</div>`;
    }).join("") + `<span class="muted" style="font-size:12px">From Disney's calendar. Check the Disney app on the day.</span>`;
  };
  counts();
  store.onChange(counts);
  document.getElementById("themeBox").addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-pick]");
    if (!b) return;
    setTheme(b.dataset.themePick || null);
    document.getElementById("themeBox").innerHTML = themeSegHtml();
    document.querySelector(`#themeBox [data-theme-pick="${b.dataset.themePick}"]`)?.focus();
  });
  document.getElementById("lockNow")?.addEventListener("click", () => { forgetKey(); location.href = BASE; });
}

// ---------- bookings ----------

function renderBookings(trip) {
  const conf = CFG.confirmations || {};
  return `
  <main>
    <header class="head">
      <div class="kicker">Bookings</div>
      <h1>Reservations<br>&amp; to-do</h1>
      <span class="muted" data-progress-text></span>
      <span class="progress" aria-hidden="true"><span data-progress-bar></span></span>
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

    <div class="dayhead" id="todo"><h2>To do</h2><button type="button" class="addbtn" data-add-todo>+ Add</button></div>
    <p class="sync" id="syncStatus" aria-live="polite" style="margin:8px 0 0"></p>
    <div id="todoBox"></div>

    <div class="dayhead" id="packing" style="margin-top:32px;scroll-margin-top:16px"><h2>Packing</h2><button type="button" class="addbtn" data-add-pack>+ Add</button></div>
    <p class="muted" style="margin:6px 0 0;font-size:14px">Late November in Orlando is usually 24–28 °C by day and 10–16 °C at night, with a chance of a cool front or a shower.</p>
    <div id="wxAlertPack" style="margin-top:12px"></div>
    <div id="packBox"></div>
    ${CFG.encrypted ? `<p style="margin-top:16px"><button type="button" class="linkbtn" id="lockNow">Lock this phone</button></p>` : ""}
  </main>`;
}

function wireBookings() {
  document.getElementById("lockNow")?.addEventListener("click", () => { forgetKey(); location.href = BASE; });
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
    if (plain && plain.ok) {
      const st = await fetch(BASE + "data/stickers.json").catch(() => null); // local preview only
      return { trip: await plain.json(), stickers: st && st.ok ? await st.json() : [] };
    }
    CFG.encrypted = true; // no readable plan here: this is the encrypted build
  }
  const blob = await (await fetch(BASE + "data/trip.enc.json")).json();
  const key = savedKey();
  if (key) {
    try { const p = await decryptBlob(blob, key); KEY_BITS = key; return p; } catch { forgetKey(); } // password changed since
  }
  return new Promise((resolve) => renderLock(blob, resolve));
}

// ---------- weather ----------
// Live forecast (assets/weather.js). Re-checked when the page comes back into view; the module
// only goes to the network when its saved copy is older than 3 hours.
async function paintWeather(trip) {
  const fc = await loadForecast(trip);
  document.querySelectorAll("[data-wx]").forEach((el) => (el.innerHTML = dayLine(fc.days?.[el.dataset.wx])));
  document.querySelectorAll("[data-wx-day]").forEach((el) => {
    const d = fc.days?.[el.dataset.wxDay];
    el.innerHTML = d ? `${dayDetail(d)}<div class="wx-sub muted">Forecast${fc.stale ? " (offline, last saved)" : ""} · ${CREDIT}</div>`
      : fc.reason === "range" ? `<div class="wx-sub muted">The forecast shows up about two weeks before.</div>` : "";
  });
  const html = fc.days ? alertHtml(packingAlerts(fc, trip), fc) : "";
  ["wxAlert", "wxAlertPack", "wxAlertMenu"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
}

// The header Nir is exactly as tall as the date line + park title beside it.
function fitHeadNir() {
  const img = document.querySelector(".headnir"), txt = document.querySelector(".headtxt");
  if (!img || !txt) return;
  const fit = () => { const h = Math.round(txt.getBoundingClientRect().height); img.style.width = img.style.height = h + "px"; };
  fit();
  new ResizeObserver(fit).observe(txt);
  document.fonts?.ready.then(fit);
}

// ---------- boot ----------
async function boot() {
  let trip;
  try {
    const payload = await loadTrip();
    trip = payload.trip;
    Object.assign(CFG, payload.config || {});
    STICKERS = payload.stickers || [];
  } catch {
    app.innerHTML = `<main><header class="head"><h1>Offline</h1><p class="lede">Couldn't load the trip plan. Open the site once with signal so it's saved for offline use.</p></header></main>`;
    return;
  }
  store = createStore(trip);
  sync = createSync(store, { bits: KEY_BITS, supabase: CFG.supabaseUrl ? { url: CFG.supabaseUrl, anonKey: CFG.supabaseAnonKey } : null });
  if (page === "home") { app.innerHTML = renderHome(trip); wireHome(); wireTodos("drawer"); }
  else if (page === "bookings") { app.innerHTML = renderBookings(trip); wireBookings(); wireTodos("page"); }
  else if (page === "menu") { app.innerHTML = renderMenu(trip); wireMenu(trip); }
  else if (page === "day") {
    const day = trip.days.find((d) => d.slug === daySlug);
    document.title = `${day.park} · ${day.label}`;
    app.innerHTML = renderDay(trip, day);
    wireDay(day);
    fitHeadNir();
  }
  app.insertAdjacentHTML("afterbegin", STARS);
  // the page is built after load, so jump to #todo / #packing ourselves (links from the Menu)
  if (location.hash.length > 1) requestAnimationFrame(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());
  paintWeather(trip);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") paintWeather(trip); });
  app.insertAdjacentHTML("beforeend", tabbar(trip));
  initStamps(STICKERS, page === "day" ? `day/${daySlug}` : page);
}
boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(BASE + "sw.js").catch(() => {}));
}
