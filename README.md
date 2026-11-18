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
3. Rebuild the encrypted site:
   `python3 scripts/build_pages.py`
   It uses the password saved in the macOS Keychain (save it once with
   `python3 scripts/build_pages.py --save-password`), or asks for it. Every build checks
   the password against the live encrypted file and stops if it doesn't match;
   `--change-password` switches passwords on purpose.
4. Commit and push. GitHub Pages updates in a minute or two.

Back up `data/trip.json` and `config.js` somewhere private: they are not on GitHub.

## Editing the schedule

On a day page, switch **List / Calendar**. In Calendar: tap an empty slot to add
an event, tap an event to edit it, long-press and drag to move it, drag its
bottom edge to change the length. In List, use the pencil on each row. Edits
save on the phone right away and work offline.

### Live sync between phones (Supabase)

1. In Supabase: **SQL Editor > New query**, paste `supabase/setup.sql`, **Run**.
2. **Project Settings > API**: copy the Project URL and the `anon` `public` key
   into `config.js` as `supabaseUrl` and `supabaseAnonKey`.
3. Rebuild (`python3 scripts/build_pages.py`) and push.

Edits are encrypted in the browser with the site password before they are sent,
so Supabase only stores an unreadable blob under an id derived from the
password. Visitors can't read or list the table: only two database functions
are exposed. Sync needs the password-protected build (live site), so the plain
local preview saves edits on that browser only.
