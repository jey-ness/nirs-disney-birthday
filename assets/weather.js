// Live forecast for the trip dates from Open-Meteo (free, no key, CC BY 4.0), in °C.
// Fetched in the browser at most every 3 hours and kept for offline use. It also turns the
// forecast into packing alerts (rain, storms, cool or hot days) for the home page.
// No trip details live here: dates and location come from the decrypted plan at runtime.

const STORE = "orlando-trip-weather-v1";
const FRESH_MS = 3 * 3600 * 1000;
const API = "https://api.open-meteo.com/v1/forecast";

const WET = (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
const LABELS = [
  [[0], "Clear"], [[1], "Mostly sunny"], [[2], "Partly cloudy"], [[3], "Cloudy"], [[45, 48], "Fog"],
  [[51, 53, 55], "Drizzle"], [[56, 57], "Freezing drizzle"], [[61], "Light rain"], [[63], "Rain"], [[65], "Heavy rain"],
  [[66, 67], "Freezing rain"], [[71, 73, 75, 77], "Snow"], [[80], "Showers"], [[81], "Showers"], [[82], "Heavy showers"],
  [[85, 86], "Snow showers"], [[95], "Thunderstorms"], [[96, 99], "Thunderstorms, hail"],
];
const label = (c) => (LABELS.find(([cs]) => cs.includes(c)) || [0, "—"])[1];

const svg = (body) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const CLOUD = `<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18z"/>`;
const ICONS = {
  sun: svg(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`),
  partly: svg(`<path d="M8 3.5v1.2M3.5 8h1.2M4.8 4.8l.9.9M11.2 4.8l-.9.9"/><path d="M5.6 10.2A3 3 0 0 1 10.6 7"/><path d="M9 19h8a3.5 3.5 0 0 0 .4-6.98 5 5 0 0 0-9.3 1.1A3 3 0 0 0 9 19z"/>`),
  cloud: svg(CLOUD),
  rain: svg(`<path d="M7 15h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.2 8.1 3.5 3.5 0 0 0 7 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>`),
  storm: svg(`<path d="M7 15h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.2 8.1 3.5 3.5 0 0 0 7 15z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/>`),
  alert: svg(`<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>`),
};
const iconFor = (c) => (c >= 95 ? ICONS.storm : c >= 51 ? ICONS.rain : c === 3 || c === 45 || c === 48 ? ICONS.cloud : c === 2 ? ICONS.partly : ICONS.sun);

const round = (n) => Math.round(n);
const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const md = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const dow = (date) => new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

function tripRange(trip) {
  const dates = [...trip.days.map((d) => d.date), ...(trip.flights || []).map((f) => f.date).filter(Boolean)].sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function readCache() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function writeCache(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* private mode */ } }

// -> { days: {date: {...}}, at, stale } | { unavailable: true }
export async function loadForecast(trip) {
  const { start, end } = tripRange(trip);
  const c = trip.days[0].center;
  const lat = c.lat.toFixed(2), lng = c.lng.toFixed(2); // area-level, not a specific address
  const key = `${lat},${lng},${start},${end}`;
  const cached = readCache();
  if (cached?.key === key && Date.now() - cached.at < FRESH_MS) return { ...cached, stale: false };

  const url = new URL(API);
  Object.entries({
    latitude: lat, longitude: lng, timezone: "America/New_York", start_date: start, end_date: end,
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    hourly: "temperature_2m,precipitation_probability",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    const res = await fetch(url, { signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(res.status === 400 ? "range" : "http");
    const j = await res.json();
    const hourAt = (date, h) => {
      const i = j.hourly.time.indexOf(`${date}T${String(h).padStart(2, "0")}:00`);
      return i < 0 ? null : { t: j.hourly.temperature_2m[i], pop: j.hourly.precipitation_probability[i] };
    };
    const days = {};
    j.daily.time.forEach((date, i) => {
      const code = j.daily.weather_code[i];
      days[date] = {
        date, code, hi: j.daily.temperature_2m_max[i], lo: j.daily.temperature_2m_min[i],
        pop: j.daily.precipitation_probability_max[i] ?? 0, mm: j.daily.precipitation_sum[i] ?? 0,
        morning: hourAt(date, 8), evening: hourAt(date, 21),
      };
    });
    const out = { key, at: Date.now(), days };
    writeCache(out);
    return { ...out, stale: false };
  } catch (err) {
    if (cached?.key === key) return { ...cached, stale: true };
    return { unavailable: true, reason: err.message === "range" ? "range" : "offline" };
  }
}

const isWet = (d) => WET(d.code) || d.mm >= 3 || d.pop >= 40;

export function dayLine(d) {
  if (!d) return "";
  const rain = isWet(d) || d.pop >= 20 ? ` · ${round(d.pop)}% rain${d.mm >= 1 ? `, ${round(d.mm)} mm` : ""}` : "";
  return `<span class="wx-ic">${iconFor(d.code)}</span><span>${round(d.hi)}° / ${round(d.lo)}° · ${label(d.code)}${rain}</span>`;
}

export function dayDetail(d) {
  if (!d) return "";
  const parts = [d.morning && `8 AM ${round(d.morning.t)}°`, d.evening && `9 PM ${round(d.evening.t)}°`].filter(Boolean).join(" · ");
  return `<div class="wx-main">${dayLine(d)}</div>${parts ? `<div class="wx-sub muted">${parts}</div>` : ""}`;
}

// Packing alerts from the forecast. Each: { kind, text }.
export function packingAlerts(fc, trip) {
  if (!fc?.days) return [];
  const name = (date) => {
    const day = trip.days.find((x) => x.date === date);
    const fl = (trip.flights || []).find((f) => f.date === date);
    return `${dow(date)} ${md(date)}${day ? ` (${day.park})` : fl ? (fl.id === "out" ? " (arrival)" : " (flight home)") : ""}`;
  };
  const list = Object.values(fc.days).sort((a, b) => a.date.localeCompare(b.date));
  const join = (xs) => (xs.length < 3 ? xs.join(" and ") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
  const out = [];
  const storms = list.filter((d) => d.code >= 95);
  const wet = list.filter(isWet);
  if (wet.length) out.push({ kind: "rain", text: `Rain likely ${join(wet.map((d) => name(d.date)))}. Pack the ponchos or a compact umbrella in the park bag, plus a zip bag for phones.` });
  if (storms.length) out.push({ kind: "storm", text: `Thunderstorms possible ${join(storms.map((d) => name(d.date)))}. Outdoor rides and shows can pause until the lightning passes.` });
  const cold = list.reduce((m, d) => (d.lo < (m?.lo ?? Infinity) ? d : m), null);
  if (cold && (cold.lo <= 14 || cold.hi <= 20)) out.push({ kind: "cool", text: `Cool: down to ${round(cold.lo)} °C on ${name(cold.date)}. Pack the warm layer and the light jacket.` });
  const hot = list.reduce((m, d) => (d.hi > (m?.hi ?? -Infinity) ? d : m), null);
  if (hot && hot.hi >= 30) out.push({ kind: "hot", text: `Hot: up to ${round(hot.hi)} °C on ${name(hot.date)}. Bring extra water and sunscreen.` });
  return out;
}

export function alertHtml(alerts, fc) {
  if (!alerts.length) return "";
  const when = new Date(fc.at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  return `<div class="wx-alert" role="status">
    <span class="wx-ic">${ICONS.alert}</span>
    <div><b>Packing alert</b>
      <ul>${alerts.map((a) => `<li>${esc(a.text)}</li>`).join("")}</ul>
      <span class="muted">From the forecast, checked ${when}${fc.stale ? " (offline, last saved)" : ""}. Forecasts change, so this updates each day.</span>
    </div>
  </div>`;
}

export const CREDIT = `<a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather: Open-Meteo</a>`;
