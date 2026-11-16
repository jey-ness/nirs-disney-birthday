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

// "10:30 AM" -> 10:30<small>AM</small>
const fmtTime = (t) => {
  const m = /^(.*?)\s*(AM|PM)$/.exec(t);
  return m ? `${esc(m[1])}<small>${m[2]}</small>` : esc(t);
};
const shortTime = (t) => t.replace(/\s*(AM|PM)$/, "");

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
function nowNext(day) {
  const { date, hm } = nyNow();
  const rows = day.schedule;
  const brief = (r) => esc(r.text);
  if (date < day.date) {
    const n = daysBetween(date, day.date);
    return { html: `<div><span class="label">In ${n} day${n === 1 ? "" : "s"} · starts ${esc(shortTime(rows[0].time))}</span><span class="val">${brief(rows[0])}</span></div>`, single: true, cur: -1 };
  }
  if (date > day.date) return { html: `<div><span class="label">Done</span><span class="val">This day is over.</span></div>`, single: true, cur: rows.length };
  let cur = -1;
  rows.forEach((r, i) => { if (r.start <= hm) cur = i; });
  const now = cur >= 0 ? rows[cur] : null;
  const next = rows[cur + 1];
  return {
    html: `<div><span class="label">Now${now ? " · " + esc(shortTime(now.time)) : ""}</span><span class="val">${now ? brief(now) : "Not started yet"}</span></div>
           <div><span class="label">Next${next ? " · " + esc(shortTime(next.time)) : ""}</span><span class="val">${next ? brief(next) : "Done for the day"}</span></div>`,
    single: false,
    cur,
  };
}

function renderDay(trip, day) {
  const nn = nowNext(day);
  const stopBy = Object.fromEntries(day.stops.map((s) => [s.order, s]));
  return `
  <main>
    <header class="head">
      <div class="kicker">${esc(longDate(day.date))}</div>
      <h1>${esc(day.park)}</h1>
      ${day.birthdayLine ? `<p class="bday">${esc(day.birthdayLine)}</p>` : ""}
      <p class="lede">${esc(day.why)}</p>
    </header>

    <div class="stick" id="stick">
      <div class="nownext ${nn.single ? "single" : ""}">${nn.html}</div>
      <div class="mapbox"><div id="map" role="region" aria-label="Map of the day's stops"></div></div>
    </div>
    <p class="mapnote" id="mapnote"></p>

    <ul class="passes">
      <li>${tag("multi", "Multi Pass")}<span>${day.passes.multi.map(esc).join(", ")}</span></li>
      <li>${tag("single", "Single Pass")}<span>${day.passes.single.map(esc).join(", ")}</span></li>
    </ul>
    ${day.note ? `<p class="note">${esc(day.note)}</p>` : ""}

    <h2>The day</h2>
    <ol class="sched" id="sched">
      ${day.schedule
        .map((r, i) => {
          const s = r.stop ? stopBy[r.stop] : null;
          const tags = [...(r.tags || [])];
          const cls = [s ? "stop" : "", i < nn.cur ? "past" : "", i === nn.cur ? "now" : ""].join(" ").trim();
          return `<li class="${cls}" ${s ? `data-stop="${s.order}"` : ""}>
            <div class="when"><span class="time">${fmtTime(r.time)}</span>${s ? `<span class="num">${s.order}</span>` : ""}</div>
            <div class="body">
              ${tags.length || s?.approx ? `<span class="tags">${tagsFor(tags)}${s?.approx ? tag("approx", "Approx. pin") : ""}</span>` : ""}
              <div class="what">${esc(r.text)}</div>
              ${s ? `<div class="where">${esc(s.name)}</div>
              <a class="dir" href="${esc(mapsUrl(s, day.park))}" target="_blank" rel="noopener">Directions ${ICON.arrow}</a>` : ""}
            </div>
          </li>`;
        })
        .join("")}
    </ol>
  </main>`;
}

// selection shared by both map renderers
let mapApi = { highlight() {}, focus() {} };
function select(order, from) {
  document.querySelectorAll("#sched li.on").forEach((el) => el.classList.remove("on"));
  const li = document.querySelector(`#sched li[data-stop="${order}"]`);
  if (li) li.classList.add("on");
  mapApi.highlight(order);
  if (from === "map" && li) {
    const stickH = document.getElementById("stick").getBoundingClientRect().height;
    window.scrollTo({ top: window.scrollY + li.getBoundingClientRect().top - stickH - 8, behavior: "smooth" });
  }
  if (from === "list") mapApi.focus(order);
}

function wireDay(day) {
  document.getElementById("sched").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const li = e.target.closest("li[data-stop]");
    if (li) select(Number(li.dataset.stop), "list");
  });
  const stops = day.stops.filter((s) => s.lat != null).sort((a, b) => a.order - b.order);
  const note = document.getElementById("mapnote");
  const approx = stops.filter((s) => s.approx).map((s) => s.order);
  const approxTxt =
    approx.length === 1 ? ` Pin ${approx[0]} is approximate.`
    : approx.length ? ` Pins ${approx.slice(0, -1).join(", ")} and ${approx.at(-1)} are approximate.` : "";
  if (CFG.mapsKey) {
    note.textContent = "Tap a pin or a row to match them up." + approxTxt;
    loadGoogle(day, stops).catch(() => {
      note.textContent = "Google Maps didn't load, so this is a simple layout of the stops, north up." + approxTxt;
      renderSvg(stops);
    });
  } else {
    note.textContent = "A simple layout of the stops, north up. Use Directions to navigate." + approxTxt;
    renderSvg(stops);
  }
}

// ---------- fallback map: SVG plot of the stops ----------
function renderSvg(stops) {
  const box = document.getElementById("map");
  const W = box.clientWidth || 342, H = box.clientHeight || 240, pad = 26;
  const lat0 = stops.reduce((a, s) => a + s.lat, 0) / stops.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = stops.map((s) => s.lng * k), ys = stops.map((s) => s.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
  const offX = (W - (maxX - minX) * scale) / 2, offY = (H - (maxY - minY) * scale) / 2;
  const pt = (s) => [offX + (s.lng * k - minX) * scale, offY + (maxY - s.lat) * scale];
  const path = stops.map((s, i) => `${i ? "L" : "M"}${pt(s).map((v) => v.toFixed(1)).join(",")}`).join(" ");
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${path}" fill="none" stroke="#5A6A82" stroke-width="1.5" stroke-dasharray="4 4" stroke-linejoin="round"/>
    ${stops
      .map((s) => {
        const [x, y] = pt(s);
        return `<g class="svgpin" data-stop="${s.order}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="13"/><text>${s.order}</text></g>`;
      })
      .join("")}
  </svg>`;
  box.querySelector("svg").addEventListener("click", (e) => {
    const g = e.target.closest(".svgpin");
    if (g) select(Number(g.dataset.stop), "map");
  });
  mapApi = {
    highlight(order) {
      box.querySelectorAll(".svgpin").forEach((g) => {
        const on = Number(g.dataset.stop) === order;
        g.classList.toggle("on", on);
        if (on) g.parentNode.appendChild(g); // bring to front
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

async function loadGoogle(day, stops) {
  await loadGoogleScript();
  const { Map, Polyline, LatLngBounds } = google.maps;
  const { AdvancedMarkerElement } = google.maps.marker;
  const el = document.getElementById("map");
  const map = new Map(el, {
    center: day.center,
    zoom: 16,
    mapId: CFG.mapId || "DEMO_MAP_ID",
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: "greedy",
    clickableIcons: false,
  });
  new Polyline({
    map,
    path: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    strokeColor: "#0E1726",
    strokeOpacity: 0.65,
    strokeWeight: 3,
  });
  const markers = {};
  const bounds = new LatLngBounds();
  stops.forEach((s) => {
    const pin = document.createElement("div");
    pin.className = "gpin";
    pin.textContent = s.order;
    const m = new AdvancedMarkerElement({ map, position: { lat: s.lat, lng: s.lng }, content: pin, title: `${s.order}. ${s.name}`, gmpClickable: true });
    pin.addEventListener("click", (e) => { e.stopPropagation(); select(s.order, "map"); });
    markers[s.order] = { m, pin, s };
    bounds.extend({ lat: s.lat, lng: s.lng });
  });
  map.fitBounds(bounds, 36);
  mapApi = {
    highlight(order) {
      Object.values(markers).forEach(({ m, pin, s }) => {
        const on = s.order === order;
        pin.classList.toggle("gon", on);
        m.zIndex = on ? 999 : s.order;
      });
    },
    focus(order) {
      const k = markers[order];
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
      onOpen(payload);
    } catch {
      err.textContent = "That password didn't work. Try again.";
      go.disabled = false; go.textContent = "Unlock";
    }
  });
}

async function loadTrip() {
  if (!CFG.encrypted) {
    const plain = await fetch(BASE + "data/trip.json").catch(() => null);
    if (plain && plain.ok) return { trip: await plain.json() };
    CFG.encrypted = true; // no readable plan here: this is the encrypted build
  }
  const blob = await (await fetch(BASE + "data/trip.enc.json")).json();
  const key = savedKey();
  if (key) {
    try { return await decryptBlob(blob, key); } catch { forgetKey(); } // password changed since
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
    app.innerHTML = renderDay(trip, day);
    wireDay(day);
  }
  app.insertAdjacentHTML("beforeend", tabbar(trip));
}
boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(BASE + "sw.js").catch(() => {}));
}
