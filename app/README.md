# TaskFlow web app (v0.1)

A calm to-do list that feels like a game, built as an installable PWA. Plain HTML, CSS and ES modules: there is no build step and nothing to install. Mochi the mascot is left out on purpose until his animations are finished (`design/` is the prototype he lives in).

## Run it

```bash
npm start            # serves app/ at http://localhost:5190
npm test             # logic tests (dates, parsing, repeats, calendar export, stats)
npm run test:pwa     # headless Edge/Chrome check: service worker, offline, install, notifications
```

Service workers need `localhost` or HTTPS, so open it through the server rather than as a file.

## What it does

| Feature | Where | Notes |
|---|---|---|
| Onboarding | first run | Six calm screens: welcome, what a quest and the P1–P6 colours mean, your name and use (Student, Work or Personal starter quests, or an empty list), daily target with plain-English streak and EXP, reminders/sound/voice, and an install prompt. Skippable, shown once, reopen from Settings → You → Welcome screens. |
| Saved quests and reminders | everywhere | Saved on the device through `js/storage.js`. Settings → Your data exports and imports a JSON backup. |
| Voice entry | + button → mic | Web Speech API (Chrome, Edge, Safari). Firefox has none, so the button explains that and you type instead. |
| Due dates from your words | + button | "Dentist Friday at 4pm", "tonight", "in 3 days", "25 Oct", "next week", "every Monday", "p1", "urgent". It sets the date, time, repeat and priority, and you can change any of them before saving. |
| Real due dates, sorting, overdue | Quests | Today / Upcoming / Someday / Done / All, an Overdue group, sort by Smart, Priority, Due date or Newest, and search. Overdue quests get a red edge. |
| Repeating quests and reminders | Quest detail → Repeat | Daily, weekdays, weekly or monthly. Ticking one off logs it and moves it to the next date. A reminder set "before due" moves with it. |
| Quest detail | tap a quest | Title, priority, due date and time, repeat, reminder, subtasks (each with its own priority), notes, focus, calendar export, delete. Fields save as you type. |
| Reminders and count badge | bell on any quest, or in the add sheet | A system notification with Done and Snooze buttons. The red count shows on the bell, the Quests tab, the tab title and the app icon. The bell panel lists what's due and what's coming. |
| Installable, offline | Settings → App | Manifest, icons, and an offline app shell cached by `sw.js`. |
| Focus timer | Focus tab | Pomodoro sessions of 15/25/50 min, tied to a quest. Earns 1 EXP per 5 min and survives reloads. |
| Calendar | Calendar tab | Week and month views, including every occurrence of a repeating quest. Add a quest on any day. Download an `.ics` file (Apple Calendar, Outlook, Google import), or use the Google Calendar link on each quest. |
| Stats and history | chart icon (top right) | Totals, current and best streak, EXP, a 7- or 30-day chart against your target, days kept this month, done by priority, focus minutes, and a full history. |

Scoring follows `design/DESIGN_BRIEF.md`: a day's EXP is `20 × (done ÷ target)`, plus 10 when the target is hit. The streak counts days in a row that hit the target.

## How reminders reach you

1. **App open, even in a background tab:** the page checks every second and shows the notification through the service worker, on time.
2. **App closed:** the service worker keeps a copy of the schedule in IndexedDB. An installed app in Chrome or Edge gets periodic background sync, so the browser wakes the worker now and then (every 15 minutes at best, at the browser's discretion) and it shows anything that has come due. Done and Snooze taps made while the app is closed are queued and applied the next time it opens.
3. **Exact timing with the app closed** needs push (a small server sending Web Push) or the mobile app's local notifications. `sw.js` already handles `push` messages for when that exists.

## Structure

```
app/
  index.html, manifest.webmanifest, sw.js
  css/app.css
  js/
    main.js          boot, hash routing, shared click handling
    storage.js       storage adapter (swap for a sync backend or a Capacitor store) + IndexedDB kv for the worker
    store.js         state and every action: quests, subtasks, reminders, focus, settings, backup
    dates.js parse.js recur.js ics.js stats.js   pure logic, covered by tests/logic.test.js
    notify.js        service worker, permission, notifications, app badge, schedule copy
    reminders.js     the reminder scheduler and badges
    speech.js        Web Speech API
    views/           one module per screen (home, quests, detail, add, calendar, focus, stats, settings, reminders)
  tests/
```

To add team sync later, write an adapter with `load()` and `save(state)` that talks to the server and pass it to `store.init(adapter)`. To wrap it as a mobile app (e.g. Capacitor), point the wrapper at `app/` and swap `notify.js` for native local notifications.
