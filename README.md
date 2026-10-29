# Levern

*/lev·earn/*: level up, earn.

<p align="center">
  <img src="docs/screenshots/mochi-welcome.png" width="220" alt="Mochi the cat on the Levern welcome screen" />
</p>

A calm to-do list that feels like a game. Finish quests, build a streak, earn EXP, climb the season leaderboard, and keep Mochi (or his orange twin, Cookie) company as he walks along the bottom bar.

**Live at https://getlevern.web.app.** The old addresses, taskflow-dailytracker.web.app and levern-app.web.app, redirect there.

Levern is an installable web app (PWA). It's plain HTML, CSS and ES modules, with no build step and no dependencies. It was called TaskFlow until version 1.09 (26 October 2026).

<p align="center">
  <img src="docs/screenshots/home.png" width="180" alt="Home" />
  <img src="docs/screenshots/quests.png" width="180" alt="Quests" />
  <img src="docs/screenshots/calendar.png" width="180" alt="Calendar" />
  <img src="docs/screenshots/focus.png" width="180" alt="Focus" />
  <img src="docs/screenshots/stats.png" width="180" alt="Stats" />
  <img src="docs/screenshots/leaderboard.png" width="180" alt="Leaderboard" />
</p>

## Features

- **Quests** with six priority colours and subtasks.
  - "How often": once, repeats (daily, weekdays, weekly, monthly, yearly or a fixed date) or times per week.
  - Reminders before the due time.
- **Quick entry** that reads plain language: "water the plants every other day at 6pm" becomes a quest with a date, time and repeat.
- **EXP:**
  - Daily EXP for the share of your target you finish, plus a bonus for hitting it.
  - Focus time earns EXP too.
  - A quest finished after it was due counts half, with a cheeky pop-up.
- **Leaderboard** (opt-in): two-week seasons, with Season first and Legacy (all-time) second.
  - Ranks from Iron upward, past seasons kept, top 15 with "Show more".
  - An OG badge for Seasons 1–3 and an animated aura for last season's top three.
  - Only a name and EXP are shared.
- **Focus** timer with 15, 25 and 50 minute presets, or a custom length ("for 1 h 20" or "until 11:20 PM").
- **Calendar** in month and week views, with Google Calendar sync and a downloadable `.ics` file.
- **Stats** for streaks, daily totals, priorities and history.
- **Themes:** light, dark and Mono.
- **Mochi and Cookie**, the cats on the nav bar. They walk, nap, react to what you do, and can be picked up and thrown.
- **Works offline** once installed. Sign in with Google to keep your data the same on every device.

## Run it locally

```bash
npm start            # serves the app at http://localhost:5190 (the desktop preview config uses 5197)
npm test             # unit tests (dates, parsing, repeats, calendar export, stats, ranks)
npm run test:pwa     # headless Edge/Chrome check: service worker, offline, install, notifications
```

Open the app through the server, not as a file, because service workers need `localhost` or HTTPS. You need Node.js installed.

## Project layout

| Path | What's there |
|---|---|
| `app/` | The web app: `index.html`, `css/`, `js/` (views in `js/views/`), icons, sounds |
| `app/mochi/`, `app/cookie/` | The cats' animation manifests and sprite strips, built in `design/mochi/v3` and copied in by its `sync.py` |
| `legacy/` | What the old addresses serve: a redirect to the same page on getlevern.web.app, and a service worker that retires old installs |
| `server.mjs` | Local server: serves `app/`, the sync API and the calendar feed |
| `functions/` | Firebase Cloud Functions for the shared backend (written, not deployed: the project is on the free Spark plan) |
| `scripts/reminders/` | The web-push reminder job, run every 5 minutes by `.github/workflows/reminders.yml` |
| `firestore.rules` | A copy of the shared security rules (see Deploying) |
| `design/` | Design brief, palette and the cats' source art |
| `docs/screenshots/` | Screenshots used on this page |

For the full feature table, the onboarding and tour details and the settings reference, see [`app/README.md`](app/README.md). Release notes are in `app/js/changelog.js` and in the app under Settings → What's new. Ideas for making money from Levern are in [`docs/monetisation.md`](docs/monetisation.md).

## Deploying

Firebase project `taskflow-dailytracker`. `firebase.json` defines three Hosting sites:

| Site | Serves |
|---|---|
| `getlevern` | The app (`app/`) |
| `taskflow-dailytracker` | `legacy/`: the old TaskFlow address, redirecting to getlevern |
| `levern-app` | `legacy/`: an earlier Levern address, redirecting to getlevern |

```bash
firebase deploy --only hosting:getlevern --project taskflow-dailytracker   # the app
firebase deploy --only hosting --project taskflow-dailytracker             # all three sites
```

Before every app deploy:
- Bump `VERSION` in `app/sw.js` so installed copies update.
- Add the release to `app/js/changelog.js`. A **new first entry, with a new `v`**, is shown to every person once as a "What's new" pop-up (`app/js/updatepop.js`), on whichever of their devices opens first, and never again. Optional `note` (an intro paragraph) and `tip` (a closing line) appear in the pop-up and on the What's new page. Adding lines to the existing first entry won't pop up again for people who've already seen it.

**Firestore rules** are shared with Terracove (formerly SoloDesk), which lives in the same project, so they're deployed from that repository (`D:\Projects\Solodesk-MVP`). Keep `firestore.rules` here in step with that copy. The leaderboard's growth rule must keep its refill of **60 EXP an hour**: `let room = o.get('bank', 0) + 60 * …`. If it drops back to 15, the board starts refusing uploads.

**Google sign-in** only works on addresses listed under Firebase → Authentication → Settings → Authorized domains. `getlevern.web.app` is on it.

## Rebrand: what's left

The app side of the TaskFlow → Levern switch is done. A few steps live in accounts only the owner can change: the Google sign-in name and domain, the GitHub repo name and merging to `main`, and some optional renames. See [`docs/rebrand-todo.md`](docs/rebrand-todo.md).

## Names that must not change

The product is called Levern, but these internal names still say TaskFlow. Renaming them would lose people's data or break sync:

- `localStorage` keys
- the service worker cache prefix `taskflow-vNN`
- the Firebase project id `taskflow-dailytracker`
- the Firestore collections `taskflowUsers` and `taskflowBoard`
- the console handle `window.TaskFlow` (`window.Levern` also works)

## Status

Version 1.09. See [`app/README.md`](app/README.md) for the feature reference, and [`docs/`](docs/) for working notes.
