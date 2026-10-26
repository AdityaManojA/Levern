# Levern rebrand: what's left for the owner

The TaskFlow → Levern switch is done in the app (see [chapter-history.md](chapter-history.md), "Rebrand checklist").
These last steps are outside the code: they're in accounts only the owner can change. Last checked 27 October 2026.

## 1. Google sign-in window

It still says **"continue to taskflow-dailytracker.firebaseapp.com"** and may show the old app name.

- [ ] **Change the app name:** Google Cloud console → project `taskflow-dailytracker` → APIs & Services → **Branding** → App name: `Levern`.
- [ ] **Show getlevern.web.app instead of the firebaseapp.com address:**
  1. Google Cloud console → APIs & Services → **Credentials** → the OAuth 2.0 *Web client (auto created by Google Service)*.
  2. Under **Authorized redirect URIs**, add `https://getlevern.web.app/__/auth/handler` and save.
  3. Then tell Claude, who switches `authDomain` in `app/config.js` to `getlevern.web.app` and deploys.

  **Don't switch `authDomain` before step 2**, or Google sign-in breaks with `redirect_uri_mismatch`. getlevern.web.app already serves the Firebase sign-in handler (checked: `/__/auth/handler` returns 200).

## 2. GitHub repository `AdityaManojA/TaskFlow`

- [ ] **Optional: rename it to Levern.** GitHub → the repo → Settings → General → Repository name. GitHub redirects the old URL, and local clones keep working (update the remote when convenient).
- [ ] **Decide whether to merge the working branch into `main`.**
  - The reminder job (`.github/workflows/reminders.yml`) runs on a schedule from `main`, which is about 45 commits behind `claude/project-thread-40lwwy` and still calls the job "TaskFlow reminders".
  - That's harmless for users today (notifications are built from quest titles), but it's out of date.
  - Careful: the local checkout of `main` at `D:\Projects\TaskFlow` has every app file staged as deleted. Merge from GitHub (a pull request) or from `TaskFlow-controls`, not from that folder.

## 3. Optional

- [ ] **Rename the Firebase project** (console display name only; the project id `taskflow-dailytracker` can't change and doesn't need to): Firebase console → Project settings → General → Project name.
- [ ] **Rename the tracker Google Sheet** if wanted.
- [ ] **Consider the `levern.app` domain.** It was unregistered on 26 October 2026 (about $15 a year). Once bought, Claude can connect it in Firebase Hosting; you'd add the two DNS records Firebase shows. It would be the cleanest address. `levern.web.app` itself is reserved by another Firebase project and can't be had.
