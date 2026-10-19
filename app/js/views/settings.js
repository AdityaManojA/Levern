import { getState, setSetting, exportData, importData, clearCompleted, resetAll, addQuest, setReminder, TIER_COLORS } from '../store.js';
import { permission, requestPermission, supported, show, hasPeriodicSync } from '../notify.js';
import { canInstall, install, isInstalled } from '../install.js';
import { swap } from '../motion.js';
import { esc, toast, play, confirmBox, download } from '../ui.js';
import { todayStr, fmtStamp } from '../dates.js';
import * as cal from '../calendars.js';
import { mascot } from '../mascot.js';
import { buildICS } from '../ics.js';
import * as account from '../account.js';
import * as cloud from '../cloud.js';

const tog = (k, on, label) => `<button class="tog" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="tog" data-k="${k}"></button>`;
const step = (k, v, unit = '') => `<div class="step"><button data-act="step" data-k="${k}" data-d="-1" aria-label="Less">−</button><b>${v}${unit}</b><button data-act="step" data-k="${k}" data-d="1" aria-label="More">+</button></div>`;
const LIMITS = { annoy: [3, 10], target: [1, 10], focusMin: [5, 90], breakMin: [1, 30], snoozeMin: [5, 60] };
const STEPS = { annoy: 1, target: 1, focusMin: 5, breakMin: 1, snoozeMin: 5 };

export function render() {
  const s = getState().settings, p = permission();
  const pText = { granted: 'Allowed. Reminders pop up even when TaskFlow is in the background.', denied: 'Blocked in your browser settings for this site. Reminders still show in the app.',
    default: 'Not asked yet.', unsupported: 'This browser has no system notifications. Reminders show in the app.' }[p];
  return `
    <div class="h-sub">Make TaskFlow yours</div>
    <h1 class="h-title">Settings</h1>

    <div class="sec">You</div>
    <div class="card">
      ${accountRow()}
      <div class="srow"><div class="l"><b>Name</b><small>Used in the greeting on Home</small></div><input class="field" style="width:150px" value="${esc(s.name)}" maxlength="30" data-input="name" aria-label="Your name" placeholder="Optional"></div>
      <div class="srow"><div class="l"><b>Welcome screens</b><small>See the introduction again</small></div><button class="mini" data-act="onboard">Show again</button></div>
      <div class="srow"><div class="l"><b>Quick tour</b><small>Mochi shows you around (30 seconds)</small></div><button class="mini" data-act="tour">Start</button></div>
    </div>

    <div class="sec">Goals</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Daily quest target</b><small>Hit this to keep your streak (1–10)</small></div>${step('target', s.target)}</div>
    </div>

    <div class="sec">Reminders</div>
    <div class="card">
      <div class="srow"><div class="l"><b>System notifications</b><small>${pText}</small></div>${tog('notify', s.notify, 'System notifications')}</div>
      ${s.notify && p === 'default' ? '<div class="srow"><div class="l"><b>Allow notifications</b><small>Your browser will ask once</small></div><button class="mini" data-act="perm">Allow</button></div>' : ''}
      <div class="srow"><div class="l"><b>Snooze length</b></div>${step('snoozeMin', s.snoozeMin, ' min')}</div>
      <div class="srow"><div class="l"><b>Try it</b><small>Adds a quest with a reminder in 10 seconds</small></div><button class="mini" data-act="test-remind">Test reminder</button></div>
      <p class="small" style="margin-top:6px">Reminders go off on time while TaskFlow is open, even in a background tab. With it fully closed, an installed app can still show them when the browser checks in (Chrome/Edge, roughly every 15 min or more${hasPeriodicSync() ? '' : '; not available in this browser'}). Exact timing with the app closed will come with the sync server or the mobile app.</p>
    </div>

    <div class="sec">Calendars</div>
    <div class="card">${calendarRows()}</div>

    <div class="sec">Focus timer</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Focus length</b></div>${step('focusMin', s.focusMin, ' min')}</div>
      <div class="srow"><div class="l"><b>Break length</b></div>${step('breakMin', s.breakMin, ' min')}</div>
    </div>

    <div class="sec">Priorities</div>
    <div class="card">
      <div class="small">Rename any tier. Colours stay fixed so P1 always reads as urgent.</div>
      ${s.tierNames.map((n, i) => `<div class="tier-in"><i style="--c:${TIER_COLORS[i]}">P${i + 1}</i><input value="${esc(n)}" maxlength="14" data-input="tier" data-i="${i}" aria-label="Name for P${i + 1}"></div>`).join('')}
    </div>

    <div class="sec">Sound and voice</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Sound effects</b><small>Taps, ticks, reminders and Mochi. Starts off if your device asks for reduced motion.</small></div>${tog('sound', s.sound, 'Sound effects')}</div>
      <div class="srow"><div class="l"><b>Try them</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="mini" data-act="hear" data-s="tick">Tick</button><button class="mini" data-act="hear" data-s="chime">Reminder</button><button class="mini" data-act="hear" data-s="mrrp">Mochi</button></div></div>
      <div class="srow"><div class="l"><b>Voice input</b><small>Mic button when adding a quest</small></div>${tog('voice', s.voice, 'Voice input')}</div>
      <div class="srow"><div class="l"><b>Volume</b></div><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-change="volume" aria-label="Volume"></div>
    </div>

    <div class="sec">Mochi</div>
    <div class="card" data-tour="mochi-settings">
      <div class="srow"><div class="l"><b>Show Mochi</b><small>The cat on the nav bar</small></div>${tog('mochi', s.mochi !== false, 'Show Mochi')}</div>
      <div class="srow"><div class="l"><b>Roam around</b><small>Walks along the bar. Off: sits by the edge.</small></div>${tog('roam', s.roam !== false, 'Mochi roams')}</div>
      <div class="srow"><div class="l"><b>Walk speed</b></div><div class="seg" style="margin:0;width:auto">${[['slow', 'Slow'], ['normal', 'Normal'], ['zoomy', 'Zoomy']].map(([v, l]) => `<button class="${(s.speed || 'slow') === v ? 'on' : ''}" data-act="speed" data-v="${v}" style="padding:5px 10px">${l}</button>`).join('')}</div></div>
      <div class="srow"><div class="l"><b>Mochi sounds</b><small>The little "mrp" when you tap him</small></div>${tog('mochiSound', s.mochiSound !== false, 'Mochi sounds')}</div>
      <div class="srow"><div class="l"><b>Patience</b><small>Taps before Mochi gets annoyed</small></div>${step('annoy', s.annoy || 5)}</div>
    </div>

    <div class="sec">App</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Install TaskFlow</b><small>${isInstalled() ? 'Installed. Running as an app.' : canInstall() ? 'Adds it to your home screen or Start menu and works offline.' : 'Use your browser menu: "Install app" (Chrome/Edge) or Share → "Add to Home Screen" (Safari).'}</small></div>
        ${canInstall() && !isInstalled() ? '<button class="mini" data-act="install">Install</button>' : ''}</div>
      <div class="srow"><div class="l"><b>Offline</b><small>${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'Ready. TaskFlow works without internet.' : 'Getting ready (reload once to finish).'}</small></div></div>
    </div>

    <div class="sec">Developer</div>
    <div class="card">
      <div class="srow"><div class="l"><b>API and webhooks</b><small>Let other apps read and change your quests, and get told when things happen</small></div><a class="mini" href="#/developer">Open</a></div>
    </div>

    <div class="sec">Your data</div>
    <div class="card">
      <p class="small" style="margin-bottom:10px">${account.user() ? 'Saved on this device and in your account. You can also export a backup file.' : 'Everything is saved on this device only. Sign in to keep it in your account, or export a backup to move it to another device.'}</p>
      <div class="row-btns"><button class="btn white sm" data-act="export">Export backup</button><label class="btn white sm" style="cursor:pointer">Import backup<input type="file" accept="application/json,.json" data-change="import" hidden></label></div>
      <div style="height:8px"></div>
      <div class="row-btns"><button class="btn ghost sm" data-act="clear-done">Clear done quests</button><button class="btn ghost sm" data-act="reset">Reset everything</button></div>
    </div>

    <div class="sec">Privacy</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Privacy policy</b><small>What TaskFlow stores and where it goes</small></div><a class="mini" href="privacy.html">Read</a></div>
      <div class="srow"><div class="l"><b>Cookies</b><small>No tracking cookies. What's kept in your browser</small></div><a class="mini" href="cookies.html">Read</a></div>
    </div>
    ${account.user() ? `<button class="btn block signout" data-act="acct-out" style="margin-top:22px">Sign out</button>
    <p class="small" style="text-align:center;margin-top:8px">Signed in as ${esc(account.user().email || account.user().name)}</p>` : ''}
    <p class="small" style="text-align:center;margin:16px 0">TaskFlow web 0.1 · light mode</p>`;
}

function calendarRows() {
  const g = cal.googleState(), feed = cal.feedAvailable();
  let gRight, gText;
  if (!cal.googleConfigured()) { gRight = '<button class="mini" data-act="acct-in">Sign in</button>'; gText = 'Sign in with Google first. Then your dated quests go into a "TaskFlow" calendar and your own Google events show up here.'; }
  else if (!g.connected) { gRight = '<button class="mini" data-act="gconnect">Connect</button>'; gText = 'Adds your dated quests to a "TaskFlow" calendar, and shows your own Google events on the Calendar screen.'; }
  else {
    gRight = `<button class="mini" data-act="gsync" ${cal.isSyncing() ? 'disabled' : ''}>${cal.isSyncing() ? 'Syncing…' : 'Sync now'}</button>`;
    const c = g.lastCounts;
    gText = (g.lastSync ? `Synced ${esc(fmtStamp(g.lastSync))}${c && (c.inserted || c.updated || c.deleted) ? ` (${c.inserted} added, ${c.updated} updated, ${c.deleted} removed${c.failed ? `, ${c.failed} failed` : ''})` : ''}.` : 'Connected.')
      + (cal.hasToken() ? ' Changes sync automatically.' : ' Tap Sync now to sign in again and catch up.')
      + (g.eventsError === 'denied' ? ' Your own events can\'t be shown: tap Disconnect, then Connect, and tick "See events" when Google asks.'
        : g.eventsError ? ' Couldn\'t read your own events this time.'
        : g.eventsAt ? ` Showing ${g.eventsCount || 0} of your own Google events on the Calendar screen.` : '');
  }
  return `
    <div class="srow"><div class="l"><b>Google Calendar</b><small>${gText}</small></div>${gRight}</div>
    ${g.connected ? '<div class="srow" style="padding-top:0;border-top:none"><div class="l"></div><button class="link" data-act="gdisconnect">Disconnect</button></div>' : ''}
    <div class="srow"><div class="l"><b>Apple Calendar</b><small>${feed === false
      ? 'A live link for your iPhone or Mac needs a server, which isn\'t on yet. For now, download a calendar file and open it to add your quests.'
      : 'Subscribe once and it stays in sync. Also works in Outlook and Google ("From URL").'}</small></div>
      ${feed === false ? '' : `<a class="mini" href="${esc(cal.webcalUrl())}">Subscribe</a>`}</div>
    <div class="row-btns" style="margin-top:4px">
      ${feed === false ? '' : '<button class="btn white sm" data-act="copy-feed">Copy feed link</button>'}
      <button class="btn white sm" data-act="ics-download">Download .ics</button>
    </div>
    ${feed === false ? '' : `<p class="small" style="margin-top:8px">Feed: ${esc(cal.feedUrl())}. Only devices that can reach this computer can use it; for your phone, TaskFlow needs to be hosted online.</p>`}`;
}

function accountRow() {
  const u = account.user();
  if (!u) return '<div class="srow"><div class="l"><b>Account</b><small>Sign in with Google to keep your quests safe and the same on all your devices.</small></div><button class="mini" data-act="acct-in">Sign in</button></div>';
  const ci = cloud.cloudInfo();
  const sync = ci.error ? esc(ci.error) : ci.lastSync ? `Saved to your account ${esc(fmtStamp(ci.lastSync))}` : 'Saving to your account…';
  return `<div class="srow acct">${u.photo ? `<img src="${esc(u.photo)}" alt="" width="36" height="36" referrerpolicy="no-referrer">` : ''}<div class="l"><b>${esc(u.name || 'Signed in')}</b><small>${esc(u.email)}<br>${sync}</small></div><button class="mini" data-act="acct-out">Sign out</button></div>`;
}

export const actions = {
  'acct-in': async el => {
    el.disabled = true; el.textContent = 'Signing in…';
    try { const u = await account.signIn(); if (u) toast(`Signed in as ${u.name || u.email}`, 'good'); } catch (e) { toast(e.message); }
    rerender();
  },
  'acct-out': async () => {
    if (!await confirmBox('Sign out of TaskFlow? Your quests stay safe in your account, and this device goes back to the start.', 'Sign out')) return;
    let r = await cloud.signOutAndReset();
    if (r.unsaved) {
      if (!await confirmBox('Your latest changes haven\'t reached your account yet (you may be offline). Sign out anyway and lose them on this device?', 'Sign out anyway')) return;
      r = await cloud.signOutAndReset({ force: true });
    }
    toast('Signed out');
  },
  gconnect: async () => { try { await cal.connectGoogle(); toast('Google Calendar connected', 'good'); } catch (e) { toast(e.message); } rerender(); },
  gsync: async () => { try { const c = await cal.syncGoogle(); if (c) toast(`Synced: ${c.inserted} added, ${c.updated} updated, ${c.deleted} removed`); } catch (e) { toast(e.message); } rerender(); },
  gdisconnect: async () => { if (await confirmBox('Stop syncing with Google Calendar? The TaskFlow calendar stays in your Google account.', 'Disconnect')) { try { await cal.disconnectGoogle(); toast('Disconnected'); } catch (e) { toast(e.message); } rerender(); } },
  'copy-feed': async () => { try { await navigator.clipboard.writeText(cal.feedUrl()); toast('Link copied'); } catch (e) { toast(cal.feedUrl()); } },
  'ics-download': () => { download('taskflow.ics', buildICS(getState().quests), 'text/calendar'); toast('Calendar file saved'); },
  tog: async el => {
    const k = el.dataset.k, on = !getState().settings[k];
    el.setAttribute('aria-checked', on);   // flip in place so the knob glides
    setSetting(k, on, { quiet: true }); play('click', 0.5);
    if (k === 'notify') { if (on) await requestPermission(); setTimeout(rerender, 300); }   // its description changes
    if (k === 'mochi') mascot.setVisible(on);
    if (k === 'roam') mascot.settingsChanged();
  },
  step: el => { const k = el.dataset.k, [lo, hi] = LIMITS[k]; setSetting(k, Math.max(lo, Math.min(hi, getState().settings[k] + STEPS[k] * +el.dataset.d))); play('click', 0.4); },
  perm: async () => { const p = await requestPermission(); toast(p === 'granted' ? 'Notifications allowed' : 'Notifications not allowed'); rerender(); },
  'test-remind': () => {
    requestPermission();
    const q = addQuest({ title: 'Test reminder', tier: 3, due: todayStr() });
    setReminder(q.id, { at: Date.now() + 10000 });
    play('click', 0.5); toast('Reminder in 10 seconds. You can switch tabs.');
  },
  install: () => install(),
  hear: el => play(el.dataset.s),
  speed: el => { setSetting('speed', el.dataset.v); play('click', 0.4); mascot.settingsChanged(); },
  export: () => { download(`taskflow-backup-${todayStr()}.json`, exportData(), 'application/json'); toast('Backup saved'); },
  'clear-done': async () => { if (await confirmBox('Remove all done quests? Your history and stats stay.', 'Clear')) { clearCompleted(); toast('Done quests cleared'); } },
  reset: async () => { if (await confirmBox('Delete all quests, history and settings on this device?', 'Reset')) { resetAll(); toast('Everything reset'); setTimeout(() => mascot.react('cry', 'my settings…'), 400); } },
};
export function onChange(el) {
  if (el.dataset.change === 'volume') { setSetting('volume', +el.value, { quiet: true }); play('click'); }
  if (el.dataset.change === 'import') {
    const f = el.files[0]; if (!f) return;
    f.text().then(async txt => {
      if (!(await confirmBox('Replace everything on this device with this backup?', 'Import'))) return;
      try { importData(txt); toast('Backup imported', 'good'); } catch (e) { toast("That file isn't a TaskFlow backup"); }
    });
  }
}
export function onInput(el) {
  if (el.dataset.input === 'name') setSetting('name', el.value.trim(), { quiet: true });
  if (el.dataset.input === 'tier') { const n = getState().settings.tierNames.slice(); n[+el.dataset.i] = el.value.trim() || `P${+el.dataset.i + 1}`; setSetting('tierNames', n, { quiet: true }); }
}
function rerender() { swap(render({})); }
export { show, supported };
