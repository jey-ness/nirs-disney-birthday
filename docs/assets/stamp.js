// Stamp tool, like Figma's: a floating button opens a round wheel of Nir stickers. Pick one, then
// every tap on the page stamps it there. Stamps stay put per page until Clear, and live sync shares them
// (and Clear) between both phones through the same encrypted row as schedule edits.
// The sticker pictures arrive inside the decrypted trip bundle, never as public files.

import { ph } from "./icons.js";

const OLD_STORE = "orlando-trip-stamps-v1"; // per-phone stamps from before sync; moved into the store once
const PER_WHEEL = 8;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STAMP_ICON = ph("stamp", 26);
const MORE_ICON = ph("arrows-clockwise", 22);

export function initStamps(stickers, pageKey, store) {
  if (!stickers?.length || !store) return;
  const byId = Object.fromEntries(stickers.map((s) => [s.id, s]));
  try {
    const old = JSON.parse(localStorage.getItem(OLD_STORE) || "null");
    if (old) {
      Object.entries(old).forEach(([page, list]) => (list || []).forEach((o) => byId[o.s] && store.addStamp({ page, ...o })));
      localStorage.removeItem(OLD_STORE);
    }
  } catch { /* ignore */ }
  const stamps = () => store.stampsFor(pageKey).filter((o) => byId[o.s]);
  let current = null; // sticker id while stamping
  let wheelPage = 0;
  // two sets: Nir and Jey (sticker.who); the wheel shows one set at a time
  const WHO = [["nir", "Nir"], ["jey", "Jey"]].filter(([w]) => stickers.some((x) => (x.who || "nir") === w));
  let who = WHO[0][0];
  const setList = () => stickers.filter((x) => (x.who || "nir") === who);
  const pages = () => Math.ceil(setList().length / PER_WHEEL);

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
      ${WHO.length > 1 ? `<div class="stamp-who" role="group" aria-label="Whose stickers">${WHO.map(([w, l]) => `<button type="button" data-who="${w}" aria-pressed="${w === who}">${l}</button>`).join("")}</div>` : ""}
      <div class="stamp-wheel" role="dialog" aria-label="Pick a stamp">
        <div class="ring" id="stampRing"></div>
        <button type="button" class="hub" id="stampMore" aria-label="More stamps">${MORE_ICON}<span id="stampPage"></span></button>
      </div>
      <button type="button" class="stamp-clear-all" id="stampClearWheel">Clear stamps on this page</button>
    </div>`);

  const $ = (id) => document.getElementById(id);
  const layer = $("stampLayer"), catcher = $("stampCatch"), bar = $("stampBar"), fab = $("stampFab"), wheel = $("stampWheel"), ring = $("stampRing");

  const stampEl = (s, pop) =>
    `<img class="stamp${pop ? " pop" : ""}" src="${byId[s.s].src}" alt="" style="left:calc(50% + ${s.x}px);top:${s.y}px;--r:${s.r}deg">`;
  const paint = () => { layer.innerHTML = stamps().map((s) => stampEl(s)).join(""); layer.style.height = document.documentElement.scrollHeight + "px"; };

  function drawRing() {
    const list = setList().slice(wheelPage * PER_WHEEL, wheelPage * PER_WHEEL + PER_WHEEL);
    ring.innerHTML = list.map((s, i) => {
      const a = (i / PER_WHEEL) * 2 * Math.PI - Math.PI / 2;
      return `<button type="button" class="slot${s.id === current ? " on" : ""}" data-s="${esc(s.id)}" aria-label="${esc(s.label)}"
        style="left:calc(50% + ${(Math.cos(a) * 108).toFixed(1)}px);top:calc(50% + ${(Math.sin(a) * 108).toFixed(1)}px)"><img src="${s.src}" alt=""></button>`;
    }).join("");
    $("stampPage").textContent = pages() > 1 ? `${wheelPage + 1}/${pages()}` : "";
    $("stampMore").hidden = pages() < 2;
    wheel.querySelectorAll(".stamp-who button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.who === who)));
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
  function clearPage() { store.clearStamps(pageKey); paint(); }

  fab.addEventListener("click", () => (wheel.hidden ? openWheel() : closeWheel()));
  $("stampScrim").addEventListener("click", closeWheel);
  $("stampMore").addEventListener("click", () => { wheelPage = (wheelPage + 1) % pages(); drawRing(); });
  wheel.querySelector(".stamp-who")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-who]");
    if (!b || b.dataset.who === who) return;
    who = b.dataset.who; wheelPage = 0; drawRing();
  });
  ring.addEventListener("click", (e) => { const b = e.target.closest(".slot"); if (b) { setCurrent(b.dataset.s); closeWheel(); } });
  $("stampClearWheel").addEventListener("click", () => { clearPage(); closeWheel(); });
  $("stampClear").addEventListener("click", clearPage);
  $("stampDone").addEventListener("click", () => setCurrent(null));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!wheel.hidden) closeWheel(); else if (current) setCurrent(null); } });

  // A tap stamps; a drag still scrolls the page underneath.
  catcher.addEventListener("click", (e) => {
    if (!current) return;
    const s = store.addStamp({ page: pageKey, s: current, x: Math.round(e.clientX - window.innerWidth / 2), y: Math.round(e.clientY + window.scrollY), r: Math.round(Math.random() * 24 - 12) });
    if (stamps().length !== layer.children.length + 1) return paint(); // a full page dropped its oldest stamp
    layer.insertAdjacentHTML("beforeend", stampEl(s, true));
    layer.style.height = document.documentElement.scrollHeight + "px";
  });

  paint();
  store.onChange((src) => { if (src === "remote") paint(); }); // the other phone stamped or cleared
  window.addEventListener("resize", paint);
  new ResizeObserver(() => (layer.style.height = document.documentElement.scrollHeight + "px")).observe(document.body);
}

// Themed Nir for each park day's header.
export const DAY_STICKER = { epcot: "epcot-chef", "magic-kingdom": "magic-kingdom-ears", "hollywood-studios": "hollywood-jedi" };
