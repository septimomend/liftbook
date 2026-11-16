# Liftbook

A personal training-program tracker: a home-screen web app (PWA) for iPhone.

- Shows today's workout one exercise at a time, with the picture, working weight, target
  sets × reps and alternatives.
- Logs sets and keeps a history.
- Has a silent rest timer: no sound, no vibration, no flash.
- Lets you edit the plan, including changing a weight mid-workout.
- Syncs two ways with a `Liftbook` folder in your Google Drive.

**Your data never lives in this repo.** The site serves only app code. The plan, logs and
pictures live on the phone (IndexedDB) and in your Google Drive.

## Layout

| Path | What |
|---|---|
| `app/` | The static site. No build step. Deploy this folder as-is. |
| `app/js/model.js` `timer.js` `backup.js` | Pure logic (unit-tested) |
| `app/js/store.js` | IndexedDB storage |
| `app/js/auth.js` `drive.js` `sync.js` `sync-ui.js` | Google sign-in, Drive REST client, two-way sync |
| `app/js/config.js` | `GOOGLE_CLIENT_ID`. Sync stays off while it is empty |
| `app/js/ui/*` | Screens |
| `tools/import_workbook.py` | One-off: Google Sheet → `tools/out/liftbook-import.json` (gitignored) |
| `docs/google-setup.md` | One-time Google Cloud setup for sync |

## Develop

```sh
npm install
npm test                      # unit tests
npm run e2e                   # headless Chrome at iPhone size (CHROME_PATH to override)
python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt && .venv/bin/pytest -q
python3 -m http.server -d app 8080   # then open http://localhost:8080
```

## Import the workbook (once)

```sh
.venv/bin/python tools/import_workbook.py --sheet-url "<your sheet link>"
# -> tools/out/liftbook-import.json  (private: never commit it)
```

Upload that file to Google Drive. On the phone, go to **Settings → Import file** and pick
it. The next sync pushes it to the `Liftbook` folder in your Drive.

## Install on the iPhone

Open the site in Safari, tap **Share → Add to Home Screen**, then open **Liftbook** from
the icon.

## Release

1. Bump `VERSION` in `app/sw.js`. Phones only pick up the new app shell when it changes.
2. Push to `main`.
