# Shared backend: TaskFlow and Solodesk

Both apps live in the Firebase project `taskflow-dailytracker` and share one sign-in (Firebase Authentication, Google) and one Firestore database (`(default)`, asia-south2). The project is on the free Spark plan, so there is **no server code running**: both apps read and write Firestore straight from the browser, and the database rules let each person reach only their own documents.

| Site | Hosting site ID | Deployed from |
|---|---|---|
| TaskFlow | `taskflow-dailytracker` → https://taskflow-dailytracker.web.app | this repo (`firebase.json` pins `"site"`) |
| Solodesk | `taskflow-solodesk` → https://taskflow-solodesk.web.app | `Solodesk-MVP` |

## Firestore rules

Solodesk deploys the rules (`Solodesk-MVP/firestore.rules`). TaskFlow's `firebase.json` has no `firestore` block, so a TaskFlow deploy never replaces them. The rules must contain both apps' blocks; the full file is `firestore.rules` in this repo. Keep the two copies the same.

## What TaskFlow stores (all keyed by the Firebase user id)

| Document | Written by | What's in it |
|---|---|---|
| `taskflowUsers/{uid}` | TaskFlow | `rev` (goes up on every change), `chunks`, `z`, `tz`, `updatedAt` |
| `taskflowUsers/{uid}/chunks/{i}` | TaskFlow | The full TaskFlow data, deflate-raw compressed, split into chunks. TaskFlow-only; Solodesk shouldn't read or write it. |
| `taskflowUsers/{uid}/share/open` | TaskFlow | **For Solodesk.** Plain JSON, updated a second or two after any change. |
| `solodeskWorkspaces/{uid}` | Solodesk | Solodesk's own workspace. TaskFlow never touches it. |

`share/open` looks like this:

```json
{
  "quests": [
    { "id": "mvf71rpwd6kaz", "title": "Submit lab report", "tier": 0, "due": "2026-10-22", "time": "17:00",
      "repeat": null, "notes": "", "subtasks": [{ "title": "Write up method", "done": true }], "updatedAt": 1792431000000 }
  ],
  "events": [
    { "id": "abc", "title": "Client call", "allDay": false, "start": "2026-10-20T09:00:00+05:30", "end": "2026-10-20T09:30:00+05:30", "where": "", "url": "https://www.google.com/calendar/event?eid=..." }
  ],
  "tz": "Asia/Kolkata",
  "updatedAt": 1792431000000
}
```

- `quests`: open quests only. `tier` 0–5 is priority P1–P6. `due` is a local date, `time` a local time (both may be null). `repeat` is `daily`, `weekdays`, `weekly`, `monthly` or null.
- `events`: the person's upcoming Google Calendar events (primary calendar, a week back to two months ahead), present only if they connected Google Calendar in TaskFlow.

To use it in Solodesk, sign in with the same Firebase config, then `onSnapshot(doc(db, 'taskflowUsers', uid, 'share', 'open'), ...)` for live updates.

## When the project moves to Blaze

`functions/` holds a server (codebase `taskflow`, so it never replaces Solodesk's `default` functions) for things a browser can't do: a live Apple Calendar link per person and Google Calendar sync while the app is closed. It isn't deployed or wired up on the free plan.
