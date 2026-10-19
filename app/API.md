# TaskFlow API (v1)

The TaskFlow server (`npm start`) has a REST API, so other apps can read and change your quests, plus outgoing webhooks that tell other apps when something happens. Everything is JSON.

- **Base URL:** `http://localhost:5190/api/v1`. To reach it from other devices or services, run TaskFlow somewhere they can reach (see [Reaching it from elsewhere](#reaching-it-from-elsewhere)).
- **Auth:** `Authorization: Bearer <your key>` on every request.
- **Data:** the server keeps the shared copy of your quests in `.data/taskflow.json` (not in the public `app/` folder). The TaskFlow app syncs with it, so changes made through the API show up in the open app within a second or two, and changes made in the app show up in the API.

## 1. Create an API key

1. Start TaskFlow: `npm start`, then open **http://localhost:5190** on the computer running it.
2. Go to **Settings → Developer → API and webhooks → Open**.
3. Under **New key**, type what it's for (e.g. "Zapier"), choose **Read only** or **Read & write**, and press **Create key**.
4. **Copy the key now.** It looks like `tf_` followed by 32 letters and digits, and it's shown only once. TaskFlow stores just a fingerprint (SHA-256 hash) of it.
5. To stop a key working, press **Revoke** next to it. That takes effect immediately.

Keys can only be created, listed or revoked from the TaskFlow app on the computer running the server. The Developer screen talks to endpoints that refuse every other machine and every other website.

Keep keys secret: anyone with a read & write key can change your quests. Don't put them in front-end code that other people can see.

## 2. Try it

```bash
# who am I?
curl http://localhost:5190/api/v1/me -H "Authorization: Bearer tf_YOUR_KEY"

# add a quest the way the app's quick add reads it (date, time, priority, repeats)
curl -X POST http://localhost:5190/api/v1/quests \
  -H "Authorization: Bearer tf_YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"text": "Renew passport by Friday at 10am", "notes": "Bring two photos"}'

# open quests, most urgent first
curl "http://localhost:5190/api/v1/quests?sort=priority" -H "Authorization: Bearer tf_YOUR_KEY"

# tick one off
curl -X POST http://localhost:5190/api/v1/quests/QUEST_ID/complete -H "Authorization: Bearer tf_YOUR_KEY"
```

On Windows PowerShell, use `curl.exe` and escape the inner quotes, or use `Invoke-RestMethod`:

```powershell
Invoke-RestMethod -Method Post http://localhost:5190/api/v1/quests -Headers @{ Authorization = "Bearer tf_YOUR_KEY" } -ContentType "application/json" -Body '{"title":"Call mum","priority":2,"due":"2026-10-20","time":"18:00"}'
```

## 3. Scopes, limits, errors

| | |
|---|---|
| Scopes | **read**: every `GET`. **write**: everything (read plus create, change, delete). |
| Rate limit | 120 requests a minute per key. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (unix seconds). Going over returns `429` with `Retry-After`. |
| CORS | Allowed from any origin (the key, not cookies, is what authorises). |
| Pagination | List endpoints take `limit` (1–200, default 50) and return `next_cursor`. Pass it back as `cursor` for the next page (`null` means the end). `total` is the full count. |

Errors always look like this:

```json
{ "error": { "code": "invalid", "message": "due must be YYYY-MM-DD or null", "field": "due" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_json` | The body isn't valid JSON |
| 401 | `unauthorized` | Missing, wrong or revoked key |
| 403 | `forbidden` | Read-only key on a write endpoint |
| 404 | `not_found` | No such quest, or no such endpoint |
| 405 | `method_not_allowed` | Wrong method for the path |
| 409 | `no_reminder` | Snooze or dismiss on a quest without a reminder |
| 413 | `too_large` | Body over 256 KB |
| 422 | `invalid` | A field failed validation (`field` says which) |
| 429 | `rate_limited` | Too many requests |

## 4. The quest object

```json
{
  "id": "mvf3aq1p8x2c",
  "title": "Renew passport",
  "priority": 2,                 // 1 = P1 Critical … 6 = P6 Someday
  "due": "2026-10-23",           // YYYY-MM-DD or null
  "time": "10:00",               // HH:MM (24h) or null
  "repeat": null,                // "daily" | "weekdays" | "weekly" | "monthly" | null
  "notes": "Bring two photos",
  "done": false,
  "completed_at": null,
  "subtasks": [{ "id": "…", "title": "Book photo", "done": false, "priority": 2 }],
  "reminder": { "at": "2026-10-23T03:30:00.000Z", "minutes_before": 60, "state": "scheduled" },
  "created_at": "2026-10-19T10:40:00.000Z",
  "updated_at": "2026-10-19T10:40:00.000Z"
}
```

`reminder.state` is one of `scheduled`, `due` (it has gone off and is waiting to be handled), `dismissed` or `done`.

## 5. Endpoints

### `GET /me`
Shows the key you're using: `{ "key": { "name", "scope", "prefix" } }`.

### `GET /quests` (read)
| Query | |
|---|---|
| `status` | `open` (default), `done`, `all` |
| `priority` | 1–6 |
| `due_before`, `due_after` | YYYY-MM-DD (inclusive) |
| `search` | text in the title or notes |
| `sort` | `created` (default), `due`, `priority` |
| `limit`, `cursor` | pagination |

Returns `{ "data": [quest…], "next_cursor": "…" | null, "total": 12 }`.

### `GET /quests/{id}` (read)
Returns `{ "data": quest }`.

### `POST /quests` (write)
Send `title` or `text`, plus any of `priority`, `due`, `time`, `repeat`, `notes`, `subtasks` (strings or `{ title, done, priority }`), and `reminder` (`{ "at": ISO }` or `{ "minutes_before": 60 }`).
`text` is read like the app's quick add, for example `"Team sync every Monday 10am p2"`. Explicit fields win over what's read from `text`.
Returns `201` with `{ "data": quest }`.

### `PATCH /quests/{id}` (write)
Any of the fields above, plus `done: true | false`. Changing `due` or `time` moves a "minutes before" reminder with it.
Returns `{ "data": quest }`.

### `POST /quests/{id}/complete` (write)
Ticks it off and logs it in the history (stats, streak, EXP). A repeating quest moves to its next date instead of closing, and the response includes `next_due`.

### `POST /quests/{id}/reopen` (write)
Un-ticks a completed quest.

### `DELETE /quests/{id}` (write)
Returns `204`.

### `GET /reminders` (read)
`status`: `active` (default, due and scheduled), `due`, `scheduled`, `all`. Sorted by time.
Returns `{ "data": [{ "quest_id", "title", "priority", "at", "minutes_before", "state" }…], … }`.

### `POST /reminders` (write)
`{ "quest_id": "…", "at": "2026-10-20T09:00:00+05:30" }` or `{ "quest_id": "…", "minutes_before": 30 }` (the quest needs a due date for that).
Returns `201` with the quest.

### `POST /reminders/{quest_id}/snooze` (write)
`{ "minutes": 10 }` (1–1440, default 10).

### `POST /reminders/{quest_id}/dismiss` (write)

### `DELETE /reminders/{quest_id}` (write)
Removes the reminder.

### `GET /stats` (read)
`days`: 1–90 (default 7).
Returns `daily_target`, `done_today`, `done_total`, `streak`, `best_streak`, `exp_total`, `exp_today`, `focus_minutes_total`, `focus_minutes_today`, `kept_this_month`, `done_by_priority` (P1…P6) and `open_quests`, plus `days` (`[{ date, count, focus, exp }]`).

## 6. Webhooks

In **Settings → Developer → Webhooks**, enter a URL and pick events, then press **Add webhook**. You'll be shown the webhook's **signing secret** (`whsec_…`) once. **Send test** posts a `ping` event, and **Recent deliveries** shows what was sent, the response status, and any retries.

| Event | When | `data` |
|---|---|---|
| `quest.created` | A quest is added (app or API) | `{ "quest": quest }` |
| `quest.updated` | A quest is changed | `{ "quest": quest }` |
| `quest.completed` | A quest is ticked off (repeating ones too) | `{ "quest": quest }` |
| `quest.deleted` | A quest is deleted | `{ "quest": quest }`, the last known copy |
| `reminder.fired` | A reminder goes off | `{ "quest_id", "title", "priority", "at" }` |

Each delivery is a `POST` with this JSON body:

```json
{ "id": "evt_5f2c…", "type": "quest.completed", "created_at": "2026-10-19T10:41:00.000Z", "data": { "quest": { … } } }
```

…and these headers:

| Header | |
|---|---|
| `TaskFlow-Event` | the event type |
| `TaskFlow-Delivery` | the event id (the same for every retry of it, so you can ignore repeats) |
| `TaskFlow-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>` |

Reply with any `2xx` within 10 seconds. Anything else, or no answer, is retried after **5 s, 30 s and 2 min**, then given up.

### Checking the signature

The signature is HMAC-SHA256, keyed with your webhook secret, over `"<t>.<raw request body>"`. Use the raw body exactly as received, before parsing. Reject old timestamps so a captured request can't be replayed.

Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyTaskFlow(secret, rawBody, header, toleranceSec = 300) {
  const m = /t=(\d+),v1=([0-9a-f]{64})/.exec(header || '');
  if (!m || Math.abs(Date.now() / 1000 - Number(m[1])) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${m[1]}.${rawBody}`).digest();
  const given = Buffer.from(m[2], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

Python:

```python
import hmac, hashlib, time, re

def verify_taskflow(secret: str, raw_body: bytes, header: str, tolerance=300) -> bool:
    m = re.match(r"t=(\d+),v1=([0-9a-f]{64})", header or "")
    if not m or abs(time.time() - int(m.group(1))) > tolerance:
        return False
    expected = hmac.new(secret.encode(), m.group(1).encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, m.group(2))
```

## Reaching it from elsewhere

By default the server only listens on this computer (`127.0.0.1`).

- **Other devices on your Wi-Fi:** run `HOST=0.0.0.0 npm start` (PowerShell: `$env:HOST="0.0.0.0"; npm start`) and use `http://<this computer's IP>:5190/api/v1`. Keys are still required for the API. The Developer screen and the app's sync still only work on this computer itself.
- **Online services** (Zapier, Make, n8n cloud, your own server): TaskFlow needs to be hosted at a public HTTPS address, or exposed with a tunnel such as Cloudflare Tunnel or ngrok. Use HTTPS so keys aren't sent in the clear.
- **Webhooks** are sent from wherever the server runs, so the receiving URL has to be reachable from there.
