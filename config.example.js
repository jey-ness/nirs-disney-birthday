// Copy to config.js (git-ignored, never committed) for local use and builds.
// scripts/build_pages.py encrypts these values into docs/ along with the trip plan.
window.TRIP_CONFIG = {
  mapsKey: "",        // Google Maps JS API key, restricted by HTTP referrer
  mapId: "",          // optional Map ID for Advanced Markers (defaults to DEMO_MAP_ID)
  confirmations: {    // optional: { "<id from data/trip.json booked[]>": "<confirmation number>" }
  }
};
