# Shared backend: TaskFlow and Solodesk

Both apps live in the Firebase project `taskflow-dailytracker` and share one sign-in (Firebase Authentication, Google) and one server (this `functions/` folder, region `asia-south2`, next to the Firestore database).

| Site | Hosting site ID | Deployed from |
|---|---|---|
| TaskFlow | `taskflow-dailytracker` → https://taskflow-dailytracker.web.app | this repo (`firebase.json` pins `"site"`) |
| Solodesk | `taskflow-solodesk` → https://taskflow-solodesk.web.app | the Solodesk repo |

Deploy each site with its own `"site"` (or target) in `firebase.json` so one never overwrites the other.

**Functions codebases must differ.** TaskFlow's functions are codebase `taskflow`; Solodesk's are `default`. A deploy only replaces functions in its own codebase, so the two repos can't delete each other's functions.

**Firestore rules belong to Solodesk** (`Solodesk-MVP/firestore.rules`, owner-only access to `solodeskWorkspaces/{uid}`). TaskFlow's `firebase.json` has no `firestore` block, so a TaskFlow deploy never replaces them. TaskFlow's server uses admin access and needs no rules.

## Using the server from Solodesk

Add the same rewrites to Solodesk's `firebase.json`, so it calls the server on its own address (no CORS needed):

```json
"rewrites": [
  { "source": "/api/**", "function": { "functionId": "api", "region": "asia-south2" } },
  { "source": "/feed/**", "function": { "functionId": "feed", "region": "asia-south2" } }
]
```

Every `/api` call except `/api/ping` and `/api/gcal/callback` needs `Authorization: Bearer <Firebase ID token>` from the signed-in user (`auth.currentUser.getIdToken()`), using the same Firebase web config as TaskFlow.

| Call | What it does |
|---|---|
| `GET /api/ping` | `{ ok, service: 'taskflow-cloud' }` |
| `GET /api/quests` | Read-only: the person's open TaskFlow quests (`?all=1` includes done ones), their time zone, their upcoming Google Calendar events and the Google connection status. Meant for Solodesk. |
| `GET /api/rev` | Change counters (`rev` for quests, `eventsRev` for events), Google status, the private feed link. Poll this, then fetch only when a counter moves. |
| `GET /api/events` | The person's upcoming Google events (primary calendar, a week back to two months ahead). |
| `POST /api/gcal/start` | Returns `{ url }` to open in a popup. Google returns to `<that site>/api/gcal/callback`, which finishes the connection. Works from either site. |
| `POST /api/gcal/sync`, `POST /api/gcal/disconnect` | Sync now / stop. One Google connection serves both apps. |
| `POST /api/sync` | TaskFlow's own full sync (merges the whole TaskFlow data). Solodesk should not call it. |

## Data (Firestore, only the server can read it)

- `users/{uid}`: the shared account root. TaskFlow keeps `rev`, `chunks`, `tz`, `feed`, `gcal`, `eventsRev` here and its data in `users/{uid}/chunks`.
- `users/{uid}/private/google`: the Google refresh token and the TaskFlow calendar. Shared by both apps.
- Solodesk keeps its data in `solodeskWorkspaces/{uid}` (written by the Solodesk app directly). The two apps never write the same documents.

## Google OAuth client

Add both sites to the web client:
- Authorized JavaScript origins: `https://taskflow-dailytracker.web.app`, `https://taskflow-solodesk.web.app`
- Authorized redirect URIs: `https://taskflow-dailytracker.web.app/api/gcal/callback`, `https://taskflow-solodesk.web.app/api/gcal/callback`

Also add `taskflow-solodesk.web.app` to Firebase → Authentication → Settings → Authorised domains, and list both sites in `ALLOWED_ORIGINS` (`functions/.env`).
