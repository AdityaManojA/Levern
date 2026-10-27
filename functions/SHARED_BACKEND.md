# Shared backend: Levern and Terracove

Formerly **TaskFlow** and **Solodesk**.

Both apps live in the Firebase project `taskflow-dailytracker` and share one sign-in (Firebase Authentication, Google) and one Firestore database (`(default)`, asia-south2). The project is on the free Spark plan, so there is **no server code running**: both apps read and write Firestore straight from the browser, and the database rules let each person reach only their own documents.

| App | Hosting site ID | URL | Deployed from |
|---|---|---|---|
| **Levern** (formerly TaskFlow) | `getlevern`<br>*(legacy: `taskflow-dailytracker`, `levern-app`)* | https://getlevern.web.app<br>*(legacy: https://taskflow-dailytracker.web.app)* | this repo (`firebase.json` pins `"site"`) |
| **Terracove** (formerly Solodesk) | `terracove`<br>*(legacy: `taskflow-solodesk`)* | https://terracove.web.app<br>*(legacy: https://taskflow-solodesk.web.app)* | `Terracove` (formerly `Solodesk-MVP`) |

## Firestore rules

Terracove deploys the rules (`Terracove/firestore.rules`). Levern's `firebase.json` has no `firestore` block, so a Levern deploy never replaces them. The rules must contain both apps' blocks; the full file is `firestore.rules` in this repo. Keep the two copies the same.

## What Levern stores (keyed by Firebase user id)

> **Note on internal schema names:** While the product names have rebranded to Levern and Terracove, internal Firestore collection paths and document keys (`taskflowUsers`, `solodeskWorkspaces`, etc.) remain unchanged to preserve existing user data and sync compatibility.

| Document | Written by | What's in it |
|---|---|---|
| `taskflowUsers/{uid}` | Levern | `rev` (goes up on every change), `chunks`, `z`, `tz`, `updatedAt` |
| `taskflowUsers/{uid}/chunks/{i}` | Levern | The full Levern data, deflate-raw compressed, split into chunks. Levern-only; Terracove shouldn't read or write it. |
| `taskflowUsers/{uid}/share/open` | Levern | **For Terracove.** Plain JSON, updated a second or two after any change. |
| `solodeskWorkspaces/{uid}` | Terracove | Terracove's own workspace. Levern never touches it. |

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
- `events`: the person's upcoming Google Calendar events (primary calendar, a week back to two months ahead), present only if they connected Google Calendar in Levern. Each event also has `tier` (0–5 = P1–P6, or null): the priority the person gave it in Levern.

To use it in Terracove, sign in with the same Firebase config, then `onSnapshot(doc(db, 'taskflowUsers', uid, 'share', 'open'), ...)` for live updates.

## When the project moves to Blaze

`functions/` holds a server (codebase `taskflow`, so it never replaces Terracove's `default` functions) for things a browser can't do: a live Apple Calendar link per person and Google Calendar sync while the app is closed. It isn't deployed or wired up on the free plan.
