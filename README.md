# Nir's Disney birthday

Mobile trip site for Walt Disney World, Nov 27–29, 2026. Password protected.

## How it works

- `docs/` is the published site (GitHub Pages, branch `main`, folder `/docs`).
  The trip plan inside it is encrypted: `docs/data/trip.enc.json`. The page asks
  for the password and decrypts it in the browser.
- The readable plan, `data/trip.json`, and `config.js` (Maps key, confirmation
  numbers) stay on your computer only. They are git-ignored on purpose: this
  repo is public.

## Edit and publish

1. Edit `data/trip.json` (or the code in `assets/`).
2. Preview locally: `python3 scripts/serve.py`, then open http://localhost:8000
3. Rebuild the encrypted site (asks for the password):
   `python3 scripts/build_pages.py`
4. Commit and push. GitHub Pages updates in a minute or two.

Back up `data/trip.json` and `config.js` somewhere private: they are not on GitHub.
