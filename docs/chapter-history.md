# Levern (formerly TaskFlow): chapter history, 24 to 27 October 2026

This is the record of one long working chapter: everything that was built, shipped, tried and dropped, and why.
It covers releases 1.01 to 1.09 (service worker taskflow-v53 up to v68), the rename from TaskFlow to **Levern**, and six rounds of logo exploration.

- **Code:** `D:\Projects\TaskFlow-controls`, branch `claude/project-thread-40lwwy` (pushed to GitHub). A copy of this file is at `docs/chapter-history.md` there.
- **Live site:** https://getlevern.web.app (Firebase project `taskflow-dailytracker`, Hosting site `getlevern`). The old taskflow-dailytracker.web.app and levern-app.web.app redirect there.
- **Logos:** Figma file "Levern logos", https://www.figma.com/design/fiZ0t0OwxSbJOGxsPfUBmx (in the drafts of toclardentity@gmail.com).

---

## 1. How things are done (the working setup)

| What | How |
|---|---|
| Deploy the app | From `TaskFlow-controls`: `firebase deploy --only hosting:getlevern --project taskflow-dailytracker --account aditya.dev.org@gmail.com`. Bump `VERSION` in `app/sw.js` every deploy, and keep the `SHELL` list to files that exist. A plain `--only hosting` also redeploys the two redirect sites. |
| Deploy database rules | The shared rules file lives in `D:\Projects\Solodesk-MVP\firestore.rules` (TaskFlow and SoloDesk share one Firebase project). Deploy with `firebase deploy --only firestore:rules --project taskflow-dailytracker --account aditya.dev.org@gmail.com`. `TaskFlow-controls/firestore.rules` is kept as a copy of it. |
| Test rules | Firestore emulator with a portable JDK 21 in the session scratchpad: `firebase emulators:exec --only firestore --project demo-tf "node rules-test.mjs"`. Rules have no `math.max`, so ternaries are used. |
| Run locally | `server.mjs` on port 5197 (launch config "controls"). It serves the app, sync and the calendar feed. |
| Tests | `npm test` (66 pass after the API tests were deleted). |
| Check the UI | Claude in Chrome on `localhost:5197` or the live site. The built-in browser pane gives stale screenshots while hidden. |
| What's new | Every release gets an entry at the top of `app/js/changelog.js`. The first entry is the version shown in Settings. |
| Tracker sheet | Google Sheet `1-D79JmB2TVoKzIEaJT-STirDApx_fEIqlmWQTlCJOVk` (Bug Fixes and Suggestions tabs), edited through Claude in Chrome and checked with a CSV export. |

**Standing rules from the owner:**
- Never add placeholder, example or test quests to the owner's data.
- Never deploy the SoloDesk portal (`wsStamp`) rules change from this side.
- Don't build Premium items (S-002 rooms) until told.
- Production deploys only after an explicit go-ahead.
- Leave the designer's cat art alone: no redrawn or vector replacements.

---

## 2. Releases shipped, in order

| Version | Commit(s) | What changed |
|---|---|---|
| 1.01 | 7d19c34, eea3b02, cacf066, 82d44fa, 4aa2963, 4a41a01 | Cookie gets 28 new moves (repair-pack sets 57–84). Cookie's smudged scared pose is removed, and so is the cat glow in dark mode. Cookie gets his own landing after a throw. The doubled Cookie frames are fixed. Cookie is the same size in every move. Mochi gets a new walk. The Name row is gone from Settings. |
| 1.02 | 9149ef4 | Custom focus timer. Yearly and date-anchored repeats. The back button closes pop-ups and sheets instead of leaving the app. |
| 1.03 | f7bd123 | Mono (black and white) theme. A "+N more quests" link under Up next. A full-width reminder unit picker. |
| 1.04 | 74e9355 | Leaderboard reworked: Season tab first, settings in a dropdown, top 15 with Show more, past seasons at the bottom. No example quests are ever created. |
| (fix) | adaf8a1 | Rank fix: season EXP now catches up (rules + client). |
| 1.05 | b65958f | Up next first, How often (Once / Repeats / Times per week), one Reminders section, Developer page and API removed. |
| 1.06 | 14d433d, 9c07e9d | OG badge, first for Season 1, then widened to everyone on the board in Seasons 1–3. |
| 1.07 | b185405, fe7b2b5, 0db1984 | Aura for last season's top three, then made faster. The leaderboard stays steady while refreshing. A new season starts everyone at 0 and Iron. |
| 1.08 | 7414064, 7997b3e, fe235b3 | Late quests earn half EXP, with a comic "!" pop-up. The leaderboard catches up within minutes. The reminder unit picker is no longer cut off. The focus timer's custom controls are fixed: For and Until are the same width, and the Until time picker opens over the Start button instead of behind it. |
| 1.09 | 22bfca2, b1ceca4, 3dd088b, e3e8267, d6755c2, 1574b60 | **TaskFlow is now Levern**, with /lev·earn/ under the logo, hosted at getlevern.web.app; the old addresses redirect. The leaderboard retries failed uploads. Home greets you by your leaderboard name. |

---

## 3. Details by area

### 3.1 Cats (Mochi and Cookie)
Pipeline: `D:\Projects\TaskFlow\design\mochi\v3` builds 3x WebP strips, using only art from `Clarity_no_Drop`.

**New art:**
- The designer's repair pack `Clarity_no_Drop/Cat-frame-repairs-2026-10-24` was integrated.
  - 28 Cookie sets (57–84) became `n-` prefixed moves.
  - The re-padded redraws replaced the old frames.
- The frames were checked byte-for-byte against the designer's zips, and the moves were rescaled.

**Removed:**
- Cookie's old `c-scared` pose (the bugged pose after a tap), deleted.
- The landing strip played after a throw, deleted. It was replaced with a new `land` move built from `n-squish`.
- The dark-mode glow around the cats, because it made them look bad.

**Double Cookie bug.** There were two causes:
1. Browsers kept old cached strips. Fixed with a per-strip `?v=<md5>` hash written by `sync.py` and added in `mochi.js urlOf`.
2. The "ghost" cross-fade between moves showed two Cookies. It is disabled for Cookie.

**Sizes:** Cookie's size was inconsistent between moves. Fixed with per-move `times` scale factors in `seqs_cookie.py` / `build.py`.

**Mochi walk:** replaced twice, first with `Mochi-walk-redraw-2026-10-25`, then with `Mochi-walk-original-character-v2` (the shipped one).

### 3.2 Quests, repeats and reminders
- **Back button (B-011):** `back.js` keeps a history, so Back closes pop-ups, sheets and menus first.
- **Custom focus timer (S-008):** any length, with `minutesUntil` in `dates.js`.
- **Repeating quests (S-009):** yearly repeats and repeats anchored to an exact date (monthly/yearly keep their day), in `recur.js`.
- **How often:** Goals were merged into one control, "How often: Once / Repeats / Times per week" (`oftenSeg` / `oftenOf`).
- **One reminder system:**
  - The separate reminder screens were merged into a single Reminders section in the quest editor and in Settings.
  - "Test reminder" in Settings now only shows a notification. It no longer creates a quest.
- **Reminder unit dropdown (B-012):** it was cut off to "h..". The first attempt (1.03) widened the native `<select>`. That never took effect, because the app replaces the select with its own `.csel` button, which matched a 74px rule meant for the number box. Fixed in 1.08: the 74px rule now targets `input.field` only, and the unit picker (`select` or `.csel`) gets 8.5–12em.
- **Late quests:**
  - A quest ticked after it was due is saved with `late: true`.
  - It counts half (`LATE = 0.5` in `stats.js`) toward the daily share. The daily target bonus still counts by quests done.
  - `latepop.js` shows a comic pop-up: a wobbling "!" badge, one of five joke lines, and a "½ EXP" pill.

### 3.3 Home, themes, onboarding
- **Home:**
  - Up next comes first.
  - The duplicate priority label is gone.
  - A stats row is added.
  - If there are more than five quests, a "+N more quests" link is shown.
- **Themes:** theme swatches in Settings, plus a new Mono theme (S-010).
- **Onboarding:** cut to four steps (account, daily target, reminders, tour).
- **Header:** a Stats button, so Stats and the Leaderboard are easy to find.

### 3.4 Leaderboard, seasons, ranks
- **Seasons:**
  - 14-day seasons from `SEASON_EPOCH` (11 Oct 2026, 18:30 UTC).
  - Season 2 started 25 Oct 18:30 UTC.
  - Final scores are kept in each entry's `past` map.
- **Layout:**
  - The Season tab comes first and Legacy second.
  - Settings sit in a `<details>` dropdown.
  - The top 15 are shown, with Show more.
  - Past seasons are at the bottom.
- **Rank mismatch fix:** the card said Ascendant while the board said Gold.
  - Cause: season EXP could only rise by as much as total EXP rose, so it fell behind.
  - Fix: season EXP is now drawn from the same anti-cheat "bucket" (at most 60 EXP, refilled over time), in both `board.js` and the rules.
- **Season 2 from zero:**
  - At the start of a season, everyone shows 0 and Iron until they earn EXP.
  - Ties go to whoever has more all-time EXP.
- **Card 8 vs board 0 (1.08):**
  - The refill was raised from 15/h to 60/h (client + rules).
  - Uploads that change nothing are skipped, so they don't reset the refill clock.
  - When the bucket is short, the app retries as soon as it has room (`waitForRoom`), at most an hour later.
  - Checked live: the board went from 7 to 8, matching the card.
- **Refresh:** the first load shows a skeleton of the board. Refresh keeps the board in place with a spinner, so cards no longer distort.
- **OG badge:**
  - First for Season 1 players, then widened to anyone on the board in Seasons 1–3 (`OG_UNTIL = 3`).
  - It's a testing-phase reward and will be retired after Season 3.
- **Aura for the top three:**
  - The owner picked option "P · Rainbow ring and sparkle".
  - Last season's top three wear it all season: a turning gold, silver or aurora ring, a shimmering name and a sparkle, on board rows, the podium and profiles.
  - It was made faster on request, with a bright highlight on the ring.

### 3.5 Removed (cleanup)
- The Developer page, the public API, the API keys and the webhooks (`developer.js`, `questops.js`, the server API routes, `API.md`, `api.test.js`).
- All example/sample quest machinery (`dropSamples` now removes any left in old data; `samples.test.js` deleted).
- Test quests created during development ("Take vitamins", "Hold test", and others) were deleted from the owner's data.
- The Name row in Settings.

### 3.6 Tracker sheet
- **Added:** B-011 (back button), S-008 (custom timer), S-009 (repeating quests), S-010 (Mono theme), S-011 ("+N more"), B-012 (reminder unit dropdown).
- **Status:** finished items were marked Complete. Premium (S-002) was left alone.

---

## 4. Tried and dropped

| Tried | Outcome |
|---|---|
| Vector/HTML rig to redraw all of Cookie's frames | Rejected by the owner ("Leave it alone"). Reverted and deleted. The designer's art stays. |
| Star badge by the name for the top three (gold/silver/bronze) | Built, then scrapped in favour of animated designs. |
| Several animated top-three designs (Discord-style filled cards and others) | Shown as options. Option P (rainbow ring and sparkle) was chosen. |
| First aura ring (an `inset: -150%` layer) | It became a thin strip on wide rows. Replaced with a square rotating layer. |
| First reminder dropdown fix (1.03, widening `<select>`) | Didn't apply to the app's custom picker. Fixed properly in 1.08. |
| Rules deploy with the 60/h refill | Right after the deploy an upload was refused. It looked like SoloDesk had overwritten the rules, but the timestamps showed SoloDesk's last deploy (00:06 IST) came before ours (00:18 IST). The refusal was the rules taking a few minutes to take effect. A later reload uploaded fine. |

---

## 5. Open items and cautions

- **Shared rules file:**
  - SoloDesk's *committed* `firestore.rules` still has the old 15/h refill. The 60/h change is only an uncommitted edit in `Solodesk-MVP`.
  - If SoloDesk deploys its rules from what's committed, the leaderboard will start refusing uploads again.
  - When that repo is next committed, the refill line must go in, but not the portal change.
- **Uncommitted portal change:** `TaskFlow-controls/firestore.rules` also has SoloDesk's uncommitted portal (`wsStamp`) change. It stays uncommitted and undeployed from here.
- **OG badge:** to be removed after Season 3.
- **Premium (S-002):** on hold.
- **Logo:** the black-and-white cat is the app icon on every device (v70). The logo rounds in Figma are reference only. The round-8 Figma board was never built (the View seat's call limit was hit).
- **Installed copies and notifications:** people who installed TaskFlow must reinstall from getlevern.web.app and turn notifications on again, because browsers tie both to the address. Old push subscriptions stop once the old site's service worker retires itself.
- **Google sign-in screen:** it may still show "taskflow-dailytracker.firebaseapp.com" and the old app name. That name lives in Google Cloud → APIs & Services → Branding, and the owner changes it there.
- **Unused Hosting site:** `levern-app` only redirects now. It can be deleted later if wanted (never deleted without asking).
- **`D:\Projects\TaskFlow` (main checkout):** has every app file staged as deleted. Don't work or commit from there; use `TaskFlow-controls`.

---

## 7. After the 1.08 release (26–27 Oct)

### 7.1 Rename to Levern and the move to getlevern.web.app
- **Name:** every place users see the name was changed (133 strings), plus the reminder job, the backend messages and the docs.
- **Kept on purpose:** storage keys, the cache prefix `taskflow-vNN`, the Firebase project and the collections `taskflowUsers` and `taskflowBoard`, so nobody lost data.
- **Tagline:** /lev·earn/ sits under the logo and on the welcome screen. The final style uses the app's own font: faint slashes, "lev" muted, and **earn** in the accent colour (#C2650A light, #FF9A3D dark, underlined in Mono).
- **Hosting:**
  - `levern.web.app` couldn't be had: it's reserved by an unknown Firebase project, outside both signed-in accounts, and Firebase never releases these names.
  - `levern-app` was created first, then the owner chose `getlevern`.
  - Both old addresses serve `legacy/`: a page that redirects to the same path and #route, plus a service worker that clears old caches and unregisters itself. Tested: an old #/leaderboard link landed on getlevern.
- **Sign-in:** `getlevern.web.app` was added to Firebase Auth's authorized domains by the owner, since that's a security setting. Google Calendar sync has no OAuth client set up (`GOOGLE_CLIENT_ID` is empty), so no OAuth origin was needed.
- **Domain idea:** `levern.app` was unregistered on 26 Oct and would be the cleanest address.

### 7.1b Rebrand checklist (audited 27 Oct)

**Done in the app:**
- The name in every screen, page title, home-screen name, manifest and notification.
- /lev·earn/ under the logo.
- The black-and-white cat icon on every device.
- The privacy and cookies pages.
- Backup and calendar download names: `levern-backup-DATE.json`, `levern.ics`.
- Share previews (Open Graph, Twitter card) and a canonical link to getlevern.web.app.

**Done for the move:**
- getlevern.web.app is live.
- The old addresses redirect page by page and retire old installs.
- getlevern.web.app is an authorized sign-in domain.
- The old site is marked noindex with a canonical link, so search engines move to the new address.

**Done for users:**
- A once-only 1.09 pop-up: the rebrand reason, the new address, old links redirecting, turning notifications back on, and the reinstall tip.
- Data, streaks and leaderboard are unaffected, because the internal keys were kept.

**Reminders:**
- Old-address push subscriptions are deleted automatically by the job (404/410).
- People re-subscribe by turning notifications on at the new address.
- The job runs from `main`, which is 42 commits behind; its only difference is the name "TaskFlow reminders".

**Terracove:** already says Levern and links to getlevern.web.app. Only its old release notes say TaskFlow, which is historically correct.

**Kept on purpose (internal, renaming would lose data or break things):**
- localStorage, IndexedDB and periodic-sync names (`taskflow-*`).
- The Firestore collections `taskflow*`.
- The Firebase project id.
- The SW cache prefix.
- The calendar event UIDs (`@taskflow.app`, so subscribed calendars don't duplicate).
- `window.TaskFlow`.

**Left for the owner (outside the code):**
1. **The Google sign-in window** still shows "taskflow-dailytracker.firebaseapp.com" and the old app name.
   - Change the app name under Google Cloud → APIs & Services → Branding.
   - To show getlevern.web.app instead: add `https://getlevern.web.app/__/auth/handler` as an authorized redirect URI on the OAuth web client. Then `authDomain` in `app/config.js` can be switched to `getlevern.web.app`. Don't switch it before that, or sign-in breaks.
2. **Firebase project display name** (console only, not user-facing): Project settings.
3. **GitHub repository** `AdityaManojA/TaskFlow`: optionally rename it to Levern (GitHub redirects the old URL). Also decide whether to merge the branch into `main`, so the reminder job runs current code. `D:\Projects\TaskFlow` (main) has every app file staged as deleted, so merge carefully.
4. **Tracker Google Sheet** title, if wanted.
5. **Optional custom domain** `levern.app`.

### 7.2 Fixes
- **Leaderboard mismatch** (card 30, board 8):
  - Cause: uploads failed silently, most likely two devices writing the entry at once, and nothing retried until the next change.
  - Fix: failed uploads now retry with backoff (15 s, doubling, up to 6 times), coming back to the app sends again, and failures are logged as `[Levern board]`.
  - The board caught up live to 165 / 30.
- **Greeting:**
  - It showed a stale saved name ("Mochi Queen"), because the Settings name field had been removed.
  - Now it's the leaderboard name, else the first word of the email (`aditya.dev.org@…` → "Aditya"), else the old saved name.
  - The helpers are `displayName()` and `emailName()` in `account.js`.

- **What's new pop-up** (`updatepop.js`, commit 648ce7d):
  - Every new release (a new first entry in `changelog.js`) pops up once per person, on whichever device opens first, with a link to the full changelog.
  - "Seen" is stored in synced settings (`updateSeen`) and on the device, and it's marked before the pop-up opens. The check waits for a real account sync, so a second device never repeats it; offline, it waits.
  - Brand-new people start up to date.
  - It uses the rank-up card, checked in light, dark and Mono.
  - 1.09 carries the rebrand note (similar names were already established) and the reinstall tip.

### 7.3 Terracove (SoloDesk) requests passed on
Three requests the owner sent here belonged to Terracove (`D:\Projects\Solodesk-MVP`), so they were forwarded word for word to its own session ("TC"):
- deleting approval requests,
- three calendar and timeline bugs (the "8 · 3c" pills, clicking a date jumping to the bottom, the glitch in the "What you're working on" side column),
- a whole-app audit.

TC shipped all of it in Terracove 1.17 (commit b4fbcaf, tag v1.17) and left the shared rules alone.

### 7.4 Logo exploration (Figma: "Levern logos", fiZ0t0OwxSbJOGxsPfUBmx)
- The connected Figma account is toclardentity@gmail.com (a View seat). It can't open the earlier file `xeeirvgq7a5y2LWToTwu5G`, so a new file was made in its drafts.
- Every mark is an editable vector component (full colour, one colour, and a dark version from round 6). Each board card shows the mark on light and dark, the "levern" lockup, an app icon, 64/32/16 px and one colour.
- The logo-design skill repo (github.com/kaankiziltug/logo-design-skill) was used for its method and its reference-library findings. Its scripts were not cloned or run, because running downloaded code is off-limits.

| Round | Status | Concepts |
|---|---|---|
| 1 (cat/check, L steps, ear-v) | Deleted: the owner wanted nothing tied to the app | — |
| 2 (free-form) | In Figma | Levitate, Folded L, **Split sun**, Arch, Stack, Overlap |
| 3 (pastel) | Deleted: the owner didn't like any | — |
| 4 (sun and arch, after round 2's Split sun and Arch) | In Figma | Stepped sun, Sunset stripes, Arch split, Twin arches, Horizon, Keyhole |
| 5 (one mark type each) | In Figma | Tick wordmark, Block L, Cut-out L, Link, Dot grid, Maze |
| 6 (cool palettes, informed by the library) | In Figma | Aurora, Check-L, Slit disc, **Pinwheel**, Progress ring, Ascent |
| 7 (app palette) | In Figma | Pinwheel and Split sun, each in three versions using Levern's own colours |
| 8 (combined) | Components in Figma; the board is local only (`design/logo-levern/round-8-combined.html`), because Figma's tool-call limit for the View seat was hit | Split sun "Ginger & ink" × "Cream tile": 1 Tile + ginger & ink (pick), 2 Outlined ginger & cream, 3 Ink tile, 4 Glow & ink |

**Logo decision (27 Oct):** round 8 option 3 "Ink tile" went live in v69, then the owner went back to the **black-and-white cat** (a white cat on black) for every device in v70. Icons are `app/icons/*-v4*`: 192/512, iPhone 180 (no longer yellow), maskable 512 with the cat in the safe zone on one exact black #191613, 32/64 favicons, and the white cat badge. The split-sun designs stay in Figma for reference.

The owner's favourites so far are round 2's **Split sun** and round 6's **Pinwheel**.

---

## 6. New name research (26 Oct 2026)

"TaskFlow" is already taken, so cat- and quest-themed names were checked against:
- the App Store (iTunes Search API),
- Google Play search,
- the .com and .app domain registries,
- a web search.

A trademark search has **not** been done yet. Do it before choosing a name.

**Clear everywhere checked** (no app with that name, and .com and .app both unregistered):
- **Loafquest**: a cat "loaf" plus quests. The best fit with the cats and the quest/EXP theme.
- **Mewnday**: mew plus Monday/day. Short and playful.
- **Biscuitlist**: cats "making biscuits" (kneading) plus a to-do list.

**No app found, .app free, .com taken:** Kneadful, Nekoquest, Whiskerdo, Tailquest, Pawtrol, Kibblequest, Napquest.

**Already taken by an app:** PawQuest, Pawdo, Pawgress, Purrsuit, Purrlist, Meowtine, Cat Quest, Loafly ("Loafly Day"), Mochi Quest ("Mochi Quest: Paw Of Destiny" on Play), WhiskerList.

**Domains taken, no app found:** Purrsist and Purrday.

### Second round (54 names checked in total)
**Also clear everywhere checked:**
- **Questmew:** quest plus mew. It says "quests, with cats" in one word. Nearest things found: a VRChat "Quest Mew" avatar and an unrelated "QuestMate" task tool.
- **Snugdo:** snug plus to-do. Cozy and short. Nothing by that name found.
- **Dayloaf:** your day, loaf-shaped. Only "The Daily Loaf" bakery and date-loaf recipes came up.

**No app found, .app free, .com taken:** Meowmentum, Pouncelist, Pounceday, Tailtick, Mewtick, Nyando, Loafday, Loafline, Yaydo, Pawtick, Questnap, Mewlist, Loaflist, Kneadlist.

### Third round: names that don't have to be about cats or quests
The aim was a warm, cozy, playful feel, partly drawn from the app's own palette (butter, ginger, cream, plum).

**Clear everywhere checked** (no app on either store, nothing notable on the web, .com and .app unregistered):
- **Mallowday:** marshmallow-soft days. Matches the cozy, rounded look.
- **Plumnook:** a plum-coloured little corner for your day.

**Weaker:**
- **Gingerday:** clear, but it collides with "Kiss a Ginger Day".
- **Marrowday:** clear, but "marrow" reads as bone marrow.
- **Tendday:** dropped, because it's too close to the "Tenday" habit tracker.

**No app, .app free, .com taken:** Plumday, Kindlet, Kettly, Dewdle.

**No app, but both domains taken:** Tidlo, Lumlo, Merrow, Hearthy.

**Already used by an app:** Sprigly, Nookly, Pipkin, Bimble, Ploof, Fernly, Tumbly, Hummi, Dovi, Toodle (Toodledo), Wunda, Pebbly, Tuffet, Dotti (has a to-do app), Nibbly, Bloomly (habit tracker and planner), Mossly, Puddly, Doozy (to-do app).

### Fourth round: upbeat, brandable names (about 200 tried)
The owner didn't like the earlier picks.

**What was ruled out:** short invented names are all taken everywhere, on the stores and both domains (Zuvo, Luma, Tidy, Arlo, Ondo, Velo, Kova and others). Of about 160 longer coinages, only a handful had a free .com.

**Clear everywhere checked** (no app on either store, .com and .app unregistered, nothing on the web):
- Tadoozle
- Doodaday
- Yayfully
- Huzzday
- Huzzalist
- Glintday
- Brisklet
- Perkloo
- Cheerloo
- Kudowin
- Twinklist

Twinklist and Twinkday sit close to "Twinkly", the smart-lights brand.

**Both domains free, app stores not confirmed (rate-limited):** Kudoday, Kudolist, Nudgeloo, Cheeriday, Boundday.

### Fifth round: sleek (Notion/Linear style) and Kudowin-style
The owner liked Kudowin and asked for sleek names. About 130 were tried.

**Kudo- names, clear on both stores, .com and .app free, nothing on the web:**
- Kudomark
- Kudolevel
- Kudrise
- Kudotally
- Kudoline
- Kudenza
- Kudovex
- Kudelle

**Sleek, clear on both stores, .app free (.com taken), nothing on the web:**
- Kudria
- Kudara
- Accoly
- Velarn
- Laurly
- Verinth
- Tovren
- Levrin
- Kyrel
- Evrin

Kyrel and Evrin are also given names.

**Ruled out:**
- Kudoro and Kudello: an iOS app of each name exists.
- Kudrin: a well-known surname (Alexei Kudrin).
- Orrent: store searches are full of "Torrent" apps.
- Every short sleek coinage tried (Strivo, Elevra, Vantra, Ascendo and others): .com and .app both taken.

### Sixth round: more sleek names (about 90 tried)
**Clear on both stores and the web, with .app free:**

| Group | Names |
|---|---|
| Laurel/accolade family | Laurest, Lauvra, Accolyn (.com free too), Acclary |
| Soft and premium | Velith, Velrin, Vorell, Orvelle, Elvanne, Levrae |
| Strong and serious | Verindo, Corvell, Calvra, Halvra, Evarn |
| Neutral startup | Tovella, Lavren, Lorith, Calith, Evelith, Mervane, Zelvane, Ostrae |

**Dropped:**
- Delvra: an iOS app of that name exists.
- Caelith and Kaelith: games of those names exist.
- Laurion: "Laurion Group".
- Selvane: a sewing app.
- Soreth: an app exists.
- Lirae: too close to the Lira apps.

### Leavern (owner's suggestion, 26 Oct)
- **Stores:** no app on the App Store or Google Play.
- **Domains:** leavern.com, .app, .io, .co and getleavern.com are all unregistered.
- **Web:** nothing found. Only near spellings came up: Leaver (a surname, and a Brexit term), and Levern/Lavern (given names).
- **Watch for:** people may say it as "leave-ern" or "lev-ern", and "leave" can read as leaving things undone.

### Levern (owner's suggestion, 26 Oct)
- **Stores:** no app on the App Store or Google Play.
- **Web:** no app, company or brand called Levern. Near names: the "Laverne" shopping app (iOS), Lever (hiring software), LeverX (an IT firm). It is also a fairly common first name (Levern/LaVerne).
- **Domains:**
  - levern.com is taken: held since 1999 through GoDaddy, renewed to 2027, with no website showing.
  - levern.app, .io, .co, getlevern.com and levernapp.com are unregistered.
- **Compared with Leavern:** Levern is easier to say ("LEV-ern") and avoids the "leave" reading, but the .com isn't available.

**Trademarks:** the USPTO search can't be reached from here. Check the final pick by hand at tmsearch.uspto.gov and on the IP India public search.

**Already used by an app:** Mewmentum (focus timer), Purrpose (habit tracker), MochiDo (to-do and habit journal), Questie and Questies (productivity games), KitTask, KitList, HearthList, Whiskit, Nyan Quest, Cozy Quest, Ticktail and Questkit (domains taken).
