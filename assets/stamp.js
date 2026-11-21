// Stamp tool, like Figma's: a floating button opens a round wheel of Nir stickers. Pick one, then
// every tap on the page stamps it there. Stamps stay put (saved on this phone, per page) until Clear.
// The sticker pictures arrive inside the decrypted trip bundle, never as public files.

const STORE = "orlando-trip-stamps-v1";
const PER_WHEEL = 8;
const MAX_STAMPS = 300;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STAMP_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 13.5V11a2.5 2.5 0 1 1 5 0v2.5"/><path d="M12 3.5a3 3 0 0 1 3 3c0 1.3-.6 2-1.2 2.8-.4.6-.3 1.2-.3 1.7h-3c0-.5.1-1.1-.3-1.7C9.6 8.5 9 7.8 9 6.5a3 3 0 0 1 3-3z"/><rect x="4.5" y="13.5" width="15" height="4" rx="1.2"/><path d="M6 20.5h12"/></svg>`;
const MORE_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>`;

function readAll() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function writeAll(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* private mode or full */ } }

export function initStamps(stickers, pageKey) {
  if (!stickers?.length) return;
  const byId = Object.fromEntries(stickers.map((s) => [s.id, s]));
  let stamps = (readAll()[pageKey] || []).filter((s) => byId[s.s]);
  let current = null; // sticker id while stamping
  let wheelPage = 0;
  const pages = Math.ceil(stickers.length / PER_WHEEL);

  document.body.insertAdjacentHTML("beforeend", `
    <div class="stamps" id="stampLayer" aria-hidden="true"></div>
    <div class="stamp-catch" id="stampCatch" hidden></div>
    <div class="stamp-bar" id="stampBar" hidden>
      <span>Tap anywhere to stamp</span>
      <button type="button" id="stampClear">Clear</button>
      <button type="button" id="stampDone" class="strong">Done</button>
    </div>
    <button type="button" class="stamp-fab" id="stampFab" aria-label="Stamps" aria-expanded="false">${STAMP_ICON}</button>
    <div class="stamp-wheel-wrap" id="stampWheel" hidden>
      <button type="button" class="stamp-scrim" id="stampScrim" aria-label="Close stamps"></button>
      <div class="stamp-wheel" role="dialog" aria-label="Pick a Nir stamp">
        <div class="ring" id="stampRing"></div>
        <button type="button" class="hub" id="stampMore" aria-label="More stamps">${MORE_ICON}<span id="stampPage"></span></button>
      </div>
      <button type="button" class="stamp-clear-all" id="stampClearWheel">Clear stamps on this page</button>
    </div>`);

  const $ = (id) => document.getElementById(id);
  const layer = $("stampLayer"), catcher = $("stampCatch"), bar = $("stampBar"), fab = $("stampFab"), wheel = $("stampWheel"), ring = $("stampRing");

  const save = () => { const all = readAll(); if (stamps.length) all[pageKey] = stamps; else delete all[pageKey]; writeAll(all); };
  const stampEl = (s, pop) =>
    `<img class="stamp${pop ? " pop" : ""}" src="${byId[s.s].src}" alt="" style="left:calc(50% + ${s.x}px);top:${s.y}px;--r:${s.r}deg">`;
  const paint = () => { layer.innerHTML = stamps.map((s) => stampEl(s)).join(""); layer.style.height = document.documentElement.scrollHeight + "px"; };

  function drawRing() {
    const list = stickers.slice(wheelPage * PER_WHEEL, wheelPage * PER_WHEEL + PER_WHEEL);
    ring.innerHTML = list.map((s, i) => {
      const a = (i / PER_WHEEL) * 2 * Math.PI - Math.PI / 2;
      return `<button type="button" class="slot${s.id === current ? " on" : ""}" data-s="${esc(s.id)}" aria-label="${esc(s.label)}"
        style="left:calc(50% + ${(Math.cos(a) * 108).toFixed(1)}px);top:calc(50% + ${(Math.sin(a) * 108).toFixed(1)}px)"><img src="${s.src}" alt=""></button>`;
    }).join("");
    $("stampPage").textContent = pages > 1 ? `${wheelPage + 1}/${pages}` : "";
    $("stampMore").hidden = pages < 2;
  }
  function openWheel() { drawRing(); wheel.hidden = false; fab.setAttribute("aria-expanded", "true"); requestAnimationFrame(() => wheel.classList.add("open")); }
  function closeWheel() { wheel.classList.remove("open"); wheel.hidden = true; fab.setAttribute("aria-expanded", "false"); }
  function setCurrent(id) {
    current = id;
    catcher.hidden = bar.hidden = !id;
    document.body.classList.toggle("stamping", !!id);
    fab.innerHTML = id ? `<img src="${byId[id].src}" alt="">` : STAMP_ICON;
    fab.setAttribute("aria-label", id ? `Stamping ${byId[id].label}. Change stamp` : "Stamps");
  }
  function clearPage() { stamps = []; save(); paint(); }

  fab.addEventListener("click", () => (wheel.hidden ? openWheel() : closeWheel()));
  $("stampScrim").addEventListener("click", closeWheel);
  $("stampMore").addEventListener("click", () => { wheelPage = (wheelPage + 1) % pages; drawRing(); });
  ring.addEventListener("click", (e) => { const b = e.target.closest(".slot"); if (b) { setCurrent(b.dataset.s); closeWheel(); } });
  $("stampClearWheel").addEventListener("click", () => { clearPage(); closeWheel(); });
  $("stampClear").addEventListener("click", clearPage);
  $("stampDone").addEventListener("click", () => setCurrent(null));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!wheel.hidden) closeWheel(); else if (current) setCurrent(null); } });

  // A tap stamps; a drag still scrolls the page underneath.
  catcher.addEventListener("click", (e) => {
    if (!current) return;
    const s = { s: current, x: Math.round(e.clientX - window.innerWidth / 2), y: Math.round(e.clientY + window.scrollY), r: Math.round(Math.random() * 24 - 12) };
    stamps.push(s);
    if (stamps.length > MAX_STAMPS) stamps.shift();
    save();
    layer.insertAdjacentHTML("beforeend", stampEl(s, true));
    layer.style.height = document.documentElement.scrollHeight + "px";
  });

  paint();
  window.addEventListener("resize", paint);
  new ResizeObserver(() => (layer.style.height = document.documentElement.scrollHeight + "px")).observe(document.body);
}

// Themed Nir for each park day's header.
export const DAY_STICKER = { epcot: "epcot-chef", "magic-kingdom": "magic-kingdom-ears", "hollywood-studios": "hollywood-jedi" };
