# Calendar connections

Levern puts your dated quests into your calendar in two ways.

| | How | Stays in sync | Setup |
|---|---|---|---|
| **Google Calendar** | Settings → Calendars → Connect. Creates a calendar called **Levern** in your Google account. | Yes. Changes sync about 3 seconds after you make them while you're signed in. After about an hour, tap **Sync now** to sign in again. | A free Google Cloud client ID (below, about 10 minutes) |
| **Apple Calendar** (also Outlook, or Google "From URL") | Settings → Calendars → Subscribe. Uses a live feed at `/calendar.ics`. | Yes. The calendar app re-checks the feed on its own schedule (Apple: Edit → Refresh, or the auto-refresh setting) | None, but the Levern server must be running (`npm start`) |
| Calendar file | Download .ics in Settings or on the Calendar tab, or the per-quest buttons | No, it's a one-time copy | None |

What syncs: every quest with a date that isn't done. That covers the title, date and time (timed quests become 30-minute events, undated times become all-day events), notes and subtasks, repeats (daily, weekdays, weekly, monthly), and "before due" reminders as calendar alerts. A finished, deleted or undated quest is removed from the calendar. Each event is coloured by priority (P1 Tomato … P6 Lavender) and marked "free" so it doesn't block your time.

Sync only goes one way: edit your quests in Levern. Changes made to events in the Levern calendar are overwritten. If you delete an event there, it comes back the next time that quest changes.

## Google Calendar: one-time setup

You need an OAuth **client ID**. It isn't a secret. It only works from the web addresses you list.

1. Go to <https://console.cloud.google.com/> and sign in with the Google account you use for Calendar.
2. Top bar → project picker → **New project**. Name it `Levern` and click **Create**, then make sure it's selected.
3. **APIs & Services → Library**, search for **Google Calendar API**, and click **Enable**.
4. **APIs & Services → OAuth consent screen** (on newer consoles: **Google Auth Platform → Branding / Audience**):
   - App name: `Levern`. User support email and developer contact: your email.
   - Audience / User type: **External**.
   - Leave publishing status on **Testing**, and under **Test users** click **Add users** and add your own Gmail address (and anyone else who will use it, up to 100).
   - Scopes / Data access: add `https://www.googleapis.com/auth/calendar.app.created`, shown as "Make secondary Google calendars, and see, create, change and delete events on them". This lets Levern touch **only the calendar it creates**, never your other calendars.
5. **APIs & Services → Credentials → Create credentials → OAuth client ID** (or **Google Auth Platform → Clients → Create client**):
   - Application type: **Web application**. Name: `Levern web`.
   - **Authorized JavaScript origins**: add `https://taskflow-dailytracker.web.app` (the hosted app) and `http://localhost:5190` (for local testing).
   - Using the Firebase project `taskflow-dailytracker` instead of a new one? Once Google sign-in is on in Firebase, it already has a client called "Web client (auto created by Google Service)". You can add the origins above to that one and use its ID.
   - Authorized redirect URIs: leave empty.
   - Click **Create** and copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
6. Open `app/config.js` and paste it in:
   ```js
   export const GOOGLE_CLIENT_ID = '1234567890-abc123.apps.googleusercontent.com';
   ```
7. Run `npm start`, open **http://localhost:5190** (use `localhost`, not `127.0.0.1`, because Google only accepts the origins you listed), then go to **Settings → Calendars → Connect**.
8. Google shows "Google hasn't verified this app". That's expected for an app in Testing that only you use. Click **Continue**, then allow access. A **Levern** calendar appears in Google Calendar, filled with your dated quests.

**To stop:** Settings → Calendars → Disconnect. The Levern calendar stays in your Google account (delete it there if you like). Reconnecting re-uses it. To fully revoke access: <https://myaccount.google.com/permissions> → Levern → Remove access.

**If something goes wrong**
- *"Error 400: redirect_uri_mismatch" / "origin_mismatch"*: the address in the browser doesn't exactly match an Authorized JavaScript origin (check `localhost` vs `127.0.0.1`, and the port).
- *"Access blocked: Levern has not completed the Google verification process"*: your account isn't in **Test users** (step 4).
- *The popup does nothing*: allow popups for localhost, then tap Connect or Sync now again.

## Apple Calendar: subscribe to the live feed

1. Run Levern with `npm start`. It serves the app and keeps `http://localhost:5190/calendar.ics` up to date whenever your quests change.
2. In Levern: **Settings → Calendars → Subscribe**. On a Mac this opens Calendar with "Subscribe to calendar". Set **Auto-refresh** to every 5 or 15 minutes and click OK.
   Without the button: Calendar → File → **New Calendar Subscription…** → paste `http://localhost:5190/calendar.ics`.
3. Outlook: Add calendar → **Subscribe from web** → the same link. Google Calendar: Other calendars → **From URL**. Google's servers have to reach the link, so this only works once Levern is hosted online.

**The honest limit:** the feed lives on the computer running `npm start`. Only that computer can see it at `localhost`. Your iPhone, and Google's servers, can't reach it until Levern is hosted somewhere public, which is the next step after testing. You can let other devices on the same Wi-Fi reach it with `HOST=0.0.0.0 npm start` and `http://<this-computer's-IP>:5190/calendar.ics`, but anyone on that network could read the feed.

Apple Reminders has no web API at all, so it needs the native app (for example a Capacitor wrapper using EventKit).
