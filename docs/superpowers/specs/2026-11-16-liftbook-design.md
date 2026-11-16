# Liftbook — Design

Date: 2026-11-16
Status: draft, awaiting owner approval

## Intent / why

The owner runs a 7-day training program from a Google Sheet
(`https://docs.google.com/spreadsheets/d/<SHEET_ID>`).
In the gym they pick up the phone for two things:

1. **"What's next?"** — which exercise, what working weight.
2. **Rest** — start a 1.5–2 min timer between sets.

A spreadsheet is clumsy for both, has no workout log, and editing weights mid-session is
awkward. The app replaces the sheet with something glanceable, one-handed, few taps.

Success: the owner trains a full week using only the app — sees the next exercise,
rests with the timer, logs sets, bumps a weight when they progress, and backs it up to
Google Drive afterwards.

## Goals

- Show today's workout one exercise at a time: picture, name, working weight (or cardio
  duration), target sets × reps, alternatives.
- Log sets (weight + reps) per exercise; keep history; show "last time" for the exercise.
- Rest timer started by logging a set.
- Edit the plan: days, exercises, order, working weights, target sets/reps, alternatives,
  pictures. Weight editable inline during a workout.
- Two-way sync of plan, logs, settings and pictures with the owner's Google Drive, through
  a Google login (revised 2026-11-16, see "Drive sync").
- Manual backup/restore to a file stays as a safety net.
- Import the existing workbook once (data + original pictures) so day one is ready —
  via a local importer that produces an import file, never via the repo.

## Non-goals (owner's decisions or agreed)

- Native iOS / App Store app. A home-screen web app (PWA) is fine "for now".
- Multi-user, sharing. (Cloud sync was a non-goal; reversed by the owner — now a goal.)
- Redrawing pictures — owner prefers the workbook's original pictures over vector redraws.
- Syncing back to the Google Sheet. The sheet is retired after import.

## Anti-goals

- Anything that slows the in-gym loop: logins, modals stacked on modals, tiny tap
  targets, more than ~2 taps from "open app" to "see next exercise + weight".
- Losing logged data. Storage must be durable on-device and backup must round-trip
  exactly.

## Constraints

- Target device: owner's iPhone, Safari, "Add to Home Screen". Must work offline in the
  gym after first load.
- Developer machine is Linux (no Xcode) — reason native iOS is out.
- Name: **Liftbook**. Repo: `septimomend/liftbook`, **private** (owner created it).
  Hosting origin TBD at deploy — GitHub Pages from a private repo needs GitHub Pro; free
  alternatives: Cloudflare Pages / Netlify from the private repo, or make the repo public
  (it holds no personal data). The URL must not change after first real use — on-device
  data and the OAuth origin are tied to it.
- **The owner's plan must not be public** (owner, 2026-11-16, reversing an earlier "public
  is fine"). The repo and the deployed site contain app code only: no program data, no
  workbook pictures, no sheet ID. Local history was rewritten to purge them before any push.
- The local `gh` CLI is logged in as a different account (`ichapk534_comcast`). Owner signs
  in themselves (`gh auth login` as `septimomend`); never ask for or handle a token in
  chat. Confirm the active account before creating the repo or pushing.
- Units: kg.

## Source data (measured from the workbook export)

Export: `.../export?format=xlsx` works anonymously (link is public), ~10 MB, 47 PNGs in
`xl/media/`.

- One tab per day (`Day_1` …). A rest-day tab contains only "REST DAY" in A2.
- Row 1: `Day N`, `Working weight`.
- Data rows: col A = muscle group (only on the first row of a group, blank below — carry
  forward), col B = exercise name, col C = working weight (number), col D = literal
  "Alternative" header, cols E… = alternatives. Some alternatives are followed by their
  own weight (e.g. `<exercise> | 60 | Alternative | <alternative> | 16`); most have no
  weight. Up to 2 alternatives seen.
  Builder should inspect exact columns with openpyxl rather than trust this summary.
- Cardio row: group `Cardio`, value is a string like `"20-25 min"` → cardio exercise with
  duration text, no sets.
- Some rows lack the "Alternative" header or have none.
- Pictures are anchored per cell in `xl/drawings/drawingN.xml` (`xdr:from` col/row +
  `r:embed` → `drawingN.xml.rels` → `xl/media/imageK.png`). Main-exercise pictures sit in
  col index 2; alternative pictures in later columns (e.g. index 7). Map each picture to
  the exercise/alternative on the same row by nearest column to its left. Unmatched
  pictures → report, don't guess.
- No sets/reps in the sheet.

## Behaviour

### Data model (shape, builder may refine)

- **Program**: ordered list of **Days** (name, rest flag).
- **Day**: ordered list of **Exercises**, each with muscle group label.
- **Exercise**: name, type (`strength` | `cardio`), working weight (kg, strength),
  duration text (cardio), target sets (default **3**), target reps (range, default
  **8–12**), picture, ordered list of **Alternatives**.
- **Alternative**: name, optional own working weight, optional picture. Swapping to an
  alternative during a workout uses its weight if set, else blank/editable.
- **Log entry**: date/time, day, exercise (or alternative actually performed), set #,
  weight, reps. Cardio logs as "done" + optional duration.

Defaults 3 × 8–12 are Claude's call; every imported exercise starts there and the owner
edits.

### Screens

1. **Today / Day picker** — opens on the next day in sequence after the last trained day
   (rest days shown, skippable). Owner can pick any day.
2. **Workout** (mockup agreed in brainstorming):
   header "Day 1 · Chest · 3 / 10"; picture; exercise name; big working weight (tap to
   edit → updates the plan); "Set 2 of 3 · 8–12 reps"; sets logged today; "last time"
   line; big **Log set & rest** button (pre-filled with working weight + target reps,
   adjustable before confirm); alternatives (tap to swap for this session); Prev / Next.
3. **Rest timer** — appears after logging a set. Default **1:30**, ±15s, Skip. Default
   rest duration editable in settings.
   - **No sound, no vibration, no flash** at zero (owner: dislikes redundant sounds). At
     zero the display just switches to "Rest over · 0:12 ago" counting up.
   - Timestamp-based: store the rest end time, render from the clock, so locking the
     phone / backgrounding does not stop or skew it.
   - Keep the screen awake during an active workout (Screen Wake Lock API, where
     supported); release it when leaving the workout.
4. **Plan editor** — add / remove / reorder days and exercises; edit all exercise fields;
   add/replace picture from photo library.
5. **History** — per exercise, list of past sessions (date, sets). No charts in v1.
6. **Settings** — rest default, Backup, Restore.

### Backup / restore

- **Backup**: builds one file (JSON containing program, logs, settings, and any
  user-added pictures as base64) and opens the iOS share sheet via Web Share API
  (`navigator.share({files})`); owner picks Google Drive (Drive app installed on phone).
  Fallback: download link.
- **Restore**: file picker → validate → replace all local data (confirm first).
- Round-trip must be lossless.

### Storage

- On the phone: IndexedDB (not localStorage — pictures and logs exceed its limits).
  Request persistent storage (`navigator.storage.persist()`). All pictures (imported and
  user-added) live in IndexedDB and are referenced as `idb:<id>`.
- On Google Drive: see "Drive sync".

### First import

- A local importer (run on the developer machine) turns the workbook into one file in the
  backup format (`liftbook-import.json`, pictures embedded). It is never committed.
- Owner uploads it to Drive from a computer, then on the phone taps **Import file**
  (= Restore) and picks it from Drive via the iOS file picker. First sync then pushes it to
  the app's Drive folder.
- A fresh install shows an empty plan with two actions: Sign in to Google (pull existing
  data) or Import file.

### Drive sync (owner's decisions + Claude's calls)

- Google login via Google Identity Services token flow, scope
  `https://www.googleapis.com/auth/drive.file` (app sees only files it created). No server.
- Access token lasts 1 h; renewing it usually needs one "Continue as …" tap on iPhone.
  Owner accepted "one tap per workout". No token is persisted beyond its lifetime.
- Drive layout: folder `Liftbook` containing `liftbook-data.json` (program, settings,
  logs, deleted-log ids, timestamps) and one file per picture, created once and never
  rewritten (pictures are immutable by id).
- When: on app open (if signed in before; shows a "Tap to sync" banner when a tap is
  needed), on Finish workout, and on a Sync button. Offline / skipped → changes wait on
  the phone. The workout never waits for sync.
- Merge (Claude's call): logs = union by id minus the union of deleted ids (sets never
  lost); program + settings = whichever side was edited most recently (`updatedAt`).
- Owner's one-time setup: Google Cloud project, Drive API enabled, OAuth web client with
  the deployed origin as authorised JavaScript origin, consent screen **In production**
  (Testing mode expires logins after 7 days). Client ID is public by design and lives in
  the repo config. Claude writes a step-by-step guide.

## Left to the builder

- Framework / no-framework, build tooling, styling, exact component structure.
- Import tooling details (output must be the backup format).
- Offline via service worker; cache strategy.
- Image compression format/size.
- Visual design beyond the agreed mockup (dark mode welcome, large tap targets).
- Tests: at minimum the importer (against the real workbook) and backup round-trip.

## Calls Claude made (owner to check)

- Default target 3 × 8–12 for every imported exercise.
- Default rest 1:30.
- App opens on the next day after the last trained day.
- History is a list per exercise, no charts in v1.
- Restore replaces all local data (after confirm), no merge.
