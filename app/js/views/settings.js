import { getState, setSetting, exportData, importData, clearCompleted, resetAll, tidyHistory, TIER_COLORS } from '../store.js';
import { summary } from '../stats.js';
import { permission, requestPermission, supported, show } from '../notify.js';
import { canInstall, install, isInstalled } from '../install.js';
import { swap } from '../motion.js';
import { esc, toast, play, confirmBox, download } from '../ui.js';
import { todayStr, fmtStamp } from '../dates.js';
import * as cal from '../calendars.js';
import { mascot } from '../mascot.js';
import { COATS, CAT_VOICE } from '../mochi.js';
// the cat on the bar: Mochi ('black') or Cookie; older coats ('ginger' became Cookie, grey and brown were Mochi)
const coatNow = s => (s.mochiColor === 'ginger' || s.mochiColor === 'cookie' ? 'cookie' : 'black');
const catName = s => (coatNow(s) === 'cookie' ? 'Cookie' : 'Mochi');
import { mySeasonExp } from '../board.js';
import { applyTheme } from '../theme.js';
import { APP_VERSION, CHANGELOG } from '../changelog.js';
import { deleteAccount } from '../cloud.js';
import { rankChip } from './common.js';
import { buildICS } from '../ics.js';
import * as account from '../account.js';
import * as cloud from '../cloud.js';
import * as nudges from '../nudges.js';
import { notifyCard } from '../notifyhelp.js';
import { debugOn, setDebug, logCount, clearLog, reportText, dlog } from '../debuglog.js';

// the diagnostic log for testers (see debuglog.js): on/off, copy, show, a test notification and clear
let logShown = false, lastReport = '';
const debugRows = () => {
  const on = debugOn();
  return `<div class="sec">Debugging</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Record diagnostic logs</b><small>Notes what sign-in, sync and notifications do on this device. No quest names, emails or tokens. Turn on when you're asked to send a log.</small></div><button class="tog" role="switch" aria-checked="${on}" aria-label="Record diagnostic logs" data-act="dbg-toggle"></button></div>
      ${on ? `<div class="srow"><div class="l"><b>${logCount()} entries</b><small>Copy the log and send it back</small></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="mini" data-act="dbg-copy">Copy log</button><button class="mini" data-act="dbg-show">${logShown ? 'Hide' : 'Show'} log</button></div></div>
      <div class="srow"><div class="l"><b>Test notification</b><small>Shows one notification now, to check this device</small></div><button class="mini" data-act="dbg-test">Send test</button></div>
      <div class="srow"><div class="l"><b>Clear log</b><small>Starts a fresh log</small></div><button class="mini" data-act="dbg-clear">Clear</button></div>
      ${logShown ? `<textarea class="field" readonly rows="12" style="width:100%;font:12px/1.4 ui-monospace,monospace" aria-label="Diagnostic log">${esc(lastReport)}</textarea>` : ''}` : ''}
    </div>`;
};

const desktopView = () => matchMedia('(min-width: 641px)').matches;
const tog = (k, on, label) => `<button class="tog" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="tog" data-k="${k}"></button>`;
const step = (k, v, unit = '') => `<div class="step"><button data-act="step" data-k="${k}" data-d="-1" aria-label="Less">−</button><b>${v}${unit}</b><button data-act="step" data-k="${k}" data-d="1" aria-label="More">+</button></div>`;
const LIMITS = { annoy: [3, 10], target: [1, 10], focusMin: [5, 90], breakMin: [1, 30], snoozeMin: [5, 60] };
const STEPS = { annoy: 1, target: 1, focusMin: 5, breakMin: 1, snoozeMin: 5 };

function themeInfo(rawT) {
  const t = (rawT === 'mono-light') ? 'mono' : (rawT || 'light');
  const map = {
    'light': { label: 'Light', desc: 'Warm cream surfaces and soft pastels', bg: '#FFF8EE', card: '#FFFFFF', ink: '#1E1B18', pri: ['#F4918A', '#F9B77E', '#FFE08A', '#B9E7CC', '#A9D6F0', '#D4C4F2'] },
    'dark': { label: 'Dark', desc: 'Near-black layers with glowing accents', bg: '#0E1014', card: '#171A20', ink: '#EEE8DF', pri: ['#FF6B6B', '#FF9A3D', '#FFCB57', '#46D19E', '#5DB6F2', '#A68BFA'] },
    'mono': { label: 'Monochrome Light', desc: 'Clean light theme in pure greys', bg: '#F5F5F4', card: '#FFFFFF', ink: '#141414', pri: ['#8A8A8A', '#A1A1A1', '#B5B5B5', '#C8C8C8', '#D9D9D9', '#EAEAEA'] },
    'mono-light-accent': { label: 'Mono Light Accent', desc: 'Greyscale base with all 6 priority colors active', bg: '#F5F5F4', card: '#FFFFFF', ink: '#141414', pri: ['#F4918A', '#F9B77E', '#FFE08A', '#B9E7CC', '#A9D6F0', '#D4C4F2'] },
    'mono-dark': { label: 'Monochrome Dark', desc: 'Inverted deep dark theme in pure greys', bg: '#121212', card: '#1C1C1C', ink: '#F0F0F0', pri: ['#F0F0F0', '#D9D9D9', '#C4C4C4', '#A8A8A8', '#8C8C8C', '#707070'] },
    'mono-dark-accent': { label: 'Mono Dark Accent', desc: 'Inverted dark greyscale with glowing priority accents', bg: '#121212', card: '#1C1C1C', ink: '#F0F0F0', pri: ['#FF6B6B', '#FF9A3D', '#FFCB57', '#46D19E', '#5DB6F2', '#A68BFA'] },
    'auto': { label: 'Follow Device', desc: 'Follows your system light or dark mode', bg: '#FFF8EE', card: '#FFFFFF', ink: '#1E1B18', pri: ['#F4918A', '#F9B77E', '#FFE08A', '#B9E7CC', '#A9D6F0', '#D4C4F2'] },
  };
  return map[t] || map['light'];
}

export function render() {
  const s = getState().settings, p = permission();
  const pText = { granted: 'Allowed. Reminders pop up even when Levern is in the background.', denied: 'Blocked in your browser settings for this site. Reminders still show in the app.',
    default: 'Not asked yet.', unsupported: 'This browser has no system notifications. Reminders show in the app.' }[p];
  return `
    <div class="h-sub">Make Levern yours</div>
    <h1 class="h-title">Settings</h1>

    <div class="sec">You</div>
    <div class="card settings-account">
      ${accountRow()}
      ${account.user() ? `<div class="srow"><div class="l"><b>Delete account</b><small>Removes your account and everything Levern keeps for you</small></div><button class="mini danger-mini" data-act="acct-delete">Delete…</button></div>` : ''}
      <div class="srow"><div class="l"><b>Welcome screens</b><small>See the introduction again</small></div><button class="mini" data-act="onboard">Show again</button></div>
      <div class="srow"><div class="l"><b>Quick tour</b><small>${catName(s)} shows you around (30 seconds)</small></div><button class="mini" data-act="tour">Start</button></div>
    </div>

    <div class="sec">Look</div>
    <div class="card theme-section">
      <div class="srow" style="display:block;border-top:none;padding:2px 0 8px">
        <div class="l" style="margin-bottom:8px"><b>Theme</b><small>Select an appearance or follow your device settings</small></div>
        <select class="field theme-select" data-change="theme" aria-label="Theme">
          <option value="light" ${(s.theme || 'light') === 'light' ? 'selected' : ''}>☀️ Light (Day)</option>
          <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>🌙 Dark (Night)</option>
          <option value="mono" ${s.theme === 'mono' || s.theme === 'mono-light' ? 'selected' : ''}>⚪ Monochrome Light</option>
          <option value="mono-light-accent" ${s.theme === 'mono-light-accent' ? 'selected' : ''}>Mono Light Accent (Colors on Priorities only)</option>
          <option value="mono-dark" ${s.theme === 'mono-dark' ? 'selected' : ''}>⚫ Monochrome Dark</option>
          <option value="mono-dark-accent" ${s.theme === 'mono-dark-accent' ? 'selected' : ''}>Mono Dark Accent (Colors on Priorities only)</option>
          <option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>Follow Device</option>
        </select>
      </div>
      ${(() => {
        const info = themeInfo(s.theme || 'light');
        const isDark = (s.theme || '').includes('dark');
        return `<div class="theme-preview-card" style="background:${info.bg};color:${info.ink};border:2px solid var(--edge);border-radius:14px;padding:12px 14px;margin-top:6px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px">
            <b style="font-size:13px">${info.label}</b>
            <span class="small" style="opacity:0.8">${info.desc}</span>
          </div>
          <div style="background:${info.card};border:1.5px solid rgba(128,128,128,0.25);border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:10px">
            <div style="width:16px;height:16px;border-radius:5px;border:2px solid ${info.pri[0]};background:${isDark ? 'transparent' : info.pri[0]};flex:none"></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px;line-height:1.2">Sample quest card</div>
              <div class="small" style="opacity:0.75;font-size:11px">Due at 4:00 PM · P1 Critical</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
            <span class="small" style="font-weight:700;font-size:11px;opacity:0.85">Priorities:</span>
            <div style="display:flex;gap:5px;flex:1">
              ${info.pri.map((col, idx) => `<div title="P${idx+1}" style="flex:1;height:12px;border-radius:4px;background:${col};border:1px solid rgba(0,0,0,0.12)"></div>`).join('')}
            </div>
          </div>
        </div>`;
      })()}
    </div>

    <div class="sec">Goals</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Daily quest target</b><small>Hit this to keep your streak (1–10)</small></div>${step('target', s.target)}</div>
    </div>

    <div class="sec">Reminders</div>
    <div class="card">
      <div class="srow"><div class="l"><b>System notifications</b><small>${pText}</small></div>${tog('notify', s.notify, 'System notifications')}</div>
      ${p === 'granted' ? '' : `<div class="srow" style="display:block"><div class="l"><b>Set up notifications</b><small>Steps for the device you're using</small></div><div style="margin-top:8px">${notifyCard()}</div></div>`}
      <div class="srow"><div class="l"><b>Snooze length</b></div>${step('snoozeMin', s.snoozeMin, ' min')}</div>
      <div class="srow"><div class="l"><b>Try it</b><small>Shows a sample notification in 10 seconds (nothing is added)</small></div><button class="mini" data-act="test-remind">Test</button></div>
      <p class="small" style="margin-top:6px">Signed in with notifications on, reminders reach you even when Levern is closed. A quest's own reminders are set on the quest (Reminders), the ones below are every day.</p>
    </div>
    <div class="card nudges" data-tour="nudges">
      <div class="l" style="margin-bottom:6px"><b>Every day</b><small class="small" style="display:block">Today's quests, water, meals and walks. Add as many times as you like; tap × on a time to remove it.</small></div>
      ${nudges.editor()}
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
      <div class="srow"><div class="l"><b>Sound effects</b><small>Taps, ticks, reminders and the cat. Starts off if your device asks for reduced motion.</small></div>${tog('sound', s.sound, 'Sound effects')}</div>
      <div class="srow"><div class="l"><b>Try them</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="mini" data-act="hear" data-s="tick">Tick</button><button class="mini" data-act="hear" data-s="chime">Reminder</button><button class="mini" data-act="hear" data-s="mrrp">Mochi</button><button class="mini" data-act="hear" data-s="mrrp" data-rate="${CAT_VOICE.cookie}">Cookie</button></div></div>
      <div class="srow"><div class="l"><b>Voice input</b><small>Mic button when adding a quest</small></div>${tog('voice', s.voice, 'Voice input')}</div>
      <div class="srow"><div class="l"><b>Volume</b></div><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-change="volume" aria-label="Volume"></div>
    </div>

    <div class="sec">Cat</div>
    <div class="card" data-tour="mochi-settings">
      <div class="srow"><div class="l"><b>Show Mochi / Cookie</b><small>The cat on the nav bar</small></div>${tog('mochi', s.mochi !== false, 'Show the cat')}</div>
      <div class="srow"><div class="l"><b>Cat</b><small>Mochi, or Cookie, his orange twin brother</small></div><div class="seg coats" style="margin:0;width:auto">${Object.entries(COATS).map(([v, c]) => `<button class="${coatNow(s) === v ? 'on' : ''}" data-act="coat" data-v="${v}" aria-pressed="${coatNow(s) === v}" style="padding:5px 10px"><i class="coat-dot" style="background:${c.swatch}"></i>${c.label}</button>`).join('')}</div></div>
      <div class="srow"><div class="l"><b>Roam around</b><small>Walks along the bar. Off: sits by the edge.</small></div>${tog('roam', s.roam !== false, 'The cat roams')}</div>
      <div class="srow"><div class="l"><b>Walk speed</b></div><div class="seg" style="margin:0;width:auto">${[['slow', 'Slow'], ['normal', 'Normal'], ['zoomy', 'Zoomy']].map(([v, l]) => `<button class="${(s.speed || 'slow') === v ? 'on' : ''}" data-act="speed" data-v="${v}" style="padding:5px 10px">${l}</button>`).join('')}</div></div>
      <div class="srow"><div class="l"><b>${catName(s)}'s sounds</b><small>The little "mrp" when you tap him</small></div>${tog('mochiSound', s.mochiSound !== false, 'Cat sounds')}</div>
      <div class="srow"><div class="l"><b>Patience</b><small>Taps before ${catName(s)} gets annoyed</small></div>${step('annoy', s.annoy || 5)}</div>
    </div>

    <div class="sec">App</div>
    <div class="card">
      <div class="srow" style="display:block"><div class="l"><b>Install Levern</b>
        <small>${isInstalled() ? 'Installed. Running as an app.'
          : canInstall() ? 'Adds it to your Start menu or home screen and works offline.'
          : desktopView() ? 'Your browser hasn\'t offered the install yet. In Chrome or Edge, click the install icon at the right of the address bar, or open the menu and choose Install Levern.'
          : 'In Safari, tap Share, then Add to Home Screen. In Chrome, open the menu and choose Install app.'}</small></div>
        ${canInstall() && !isInstalled() ? '<div style="margin-top:10px"><button class="btn sm dark" data-act="install">Install Levern</button></div>' : ''}</div>
      <div class="srow"><div class="l"><b>Offline</b><small>${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'Ready. Levern works without internet.' : 'Getting ready (reload once to finish).'}</small></div></div>
    </div>

    <div class="sec">Your data</div>
    <div class="card">
      <p class="small" style="margin-bottom:10px">${account.user() ? 'Saved on this device and in your account. You can also export a backup file.' : 'Everything is saved on this device only. Sign in to keep it in your account, or export a backup to move it to another device.'}</p>
      <div class="row-btns"><button class="btn white sm" data-act="export">Export backup</button><label class="btn white sm" style="cursor:pointer">Import backup<input type="file" accept="application/json,.json" data-change="import" hidden></label></div>
      <div style="height:8px"></div>
      <div class="row-btns"><button class="btn ghost sm" data-act="tidy-exp">Remove duplicate completions</button><button class="btn ghost sm" data-act="clear-done">Clear done quests</button><button class="btn ghost sm" data-act="reset">Reset everything</button></div>
    </div>

    <div class="sec">Privacy</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Privacy policy</b><small>What Levern stores and where it goes</small></div><a class="mini" href="privacy.html">Read</a></div>
      <div class="srow"><div class="l"><b>Cookies</b><small>No tracking cookies. What's kept in your browser</small></div><a class="mini" href="cookies.html">Read</a></div>
    </div>
    ${debugRows()}
    ${account.user() ? `<button class="btn block signout" data-act="acct-out" style="margin-top:22px">Sign out</button>
    <p class="small" style="text-align:center;margin-top:8px">Signed in as ${esc(account.user().email || account.user().name)}</p>` : ''}
    <div class="sec">What's new</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Updates</b><small>Version ${esc(APP_VERSION)} · ${esc(CHANGELOG[0].title)}</small></div><a class="mini" href="#/whatsnew">See all</a></div>
    </div>
    <p class="small" style="text-align:center;margin:16px 0">Levern web ${esc(APP_VERSION)}</p>`;
}

function calendarRows() {
  const g = cal.googleState(), feed = cal.feedAvailable();
  let gRight, gText;
  if (!cal.googleConfigured()) { gRight = '<button class="mini" data-act="acct-in">Sign in</button>'; gText = 'Sign in with Google first. Then your dated quests go into a "Levern" calendar and your own Google events show up here.'; }
  else if (!g.connected) {
    gRight = '<button class="mini" data-act="gconnect">Connect</button>';
    gText = 'Adds your dated quests to a "Levern" calendar, and shows your own Google events on the Calendar screen. '
      + 'Note: Google sync needs approval from Google first, and some Google accounts (such as ones with Advanced Protection) block it. '
      + 'Until then, use the calendar link below: in Google Calendar, choose Other calendars, then From URL.';
  }
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
    ${feed === false ? '' : `<p class="small" style="margin-top:8px">Feed: ${esc(cal.feedUrl())}. Only devices that can reach this computer can use it; for your phone, Levern needs to be hosted online.</p>`}`;
}

function accountRow() {
  const u = account.user();
  if (!u) return '<div class="srow"><div class="l"><b>Account</b><small>Sign in with Google to keep your quests safe and the same on all your devices.</small></div><button class="mini" data-act="acct-in">Sign in</button></div>';
  const ci = cloud.cloudInfo();
  const sync = ci.error ? esc(ci.error) : ci.lastSync ? `Saved to your account ${esc(fmtStamp(ci.lastSync))}` : 'Saving to your account…';
  return `<div class="srow acct">${u.photo ? `<img src="${esc(u.photo)}" alt="" width="36" height="36" referrerpolicy="no-referrer">` : ''}<div class="l acct-details"><b>${esc(u.name || 'Signed in')}</b><small class="acct-email">${esc(u.email)}</small><div class="acct-meta"><small class="acct-sync" role="status">${sync}</small><a class="acct-rank" href="#/leaderboard" aria-label="Your season rank. Open the leaderboard">${rankChip(mySeasonExp())}</a></div></div><button class="mini" data-act="acct-out">Sign out</button></div>`;
}

export const actions = {
  'acct-delete': () => deleteFlow(),
  'acct-in': async el => {
    el.disabled = true; el.textContent = 'Signing in…';
    try { const u = await account.signIn(); if (u) toast(`Signed in as ${u.name || u.email}`, 'good'); } catch (e) { toast(e.message); }
    rerender();
  },
  'acct-out': async () => {
    if (!await confirmBox('Sign out of Levern? Your quests stay safe in your account, and this device goes back to the start.', 'Sign out')) return;
    let r = await cloud.signOutAndReset();
    if (r.unsaved) {
      if (!await confirmBox('Your latest changes haven\'t reached your account yet (you may be offline). Sign out anyway and lose them on this device?', 'Sign out anyway')) return;
      r = await cloud.signOutAndReset({ force: true });
    }
    toast('Signed out');
  },
  gconnect: async () => { try { await cal.connectGoogle(); toast('Google Calendar connected', 'good'); } catch (e) { toast(e.message); } rerender(); },
  gsync: async () => { try { const c = await cal.syncGoogle(); if (c) toast(`Synced: ${c.inserted} added, ${c.updated} updated, ${c.deleted} removed`); } catch (e) { toast(e.message); } rerender(); },
  gdisconnect: async () => { if (await confirmBox('Stop syncing with Google Calendar? The Levern calendar stays in your Google account.', 'Disconnect')) { try { await cal.disconnectGoogle(); toast('Disconnected'); } catch (e) { toast(e.message); } rerender(); } },
  'copy-feed': async () => { try { await navigator.clipboard.writeText(cal.feedUrl()); toast('Link copied'); } catch (e) { toast(cal.feedUrl()); } },
  'ics-download': () => { download('levern.ics', buildICS(getState().quests), 'text/calendar'); toast('Calendar file saved'); },
  'dbg-toggle': () => { setDebug(!debugOn()); if (!debugOn()) { logShown = false; } rerender(); },
  'dbg-clear': () => { clearLog(); logShown = false; toast('Log cleared'); rerender(); },
  'dbg-show': async () => { logShown = !logShown; if (logShown) lastReport = await reportText({ signedIn: !!account.user() }); rerender(); },
  'dbg-copy': async () => {
    const text = await reportText({ signedIn: !!account.user() });
    try { await navigator.clipboard.writeText(text); toast('Log copied. Send it back to the developer.', 'good'); }
    catch (e) {
      // no clipboard access here: show the text so it can be copied by hand
      lastReport = text; logShown = true; rerender(); toast('Couldn\'t copy automatically. Select the text below and copy it.');
    }
  },
  'dbg-test': async () => {
    const p = permission();
    dlog('notify', 'test notification requested', { permission: p });
    if (p !== 'granted') { toast('Allow notifications first'); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Levern test', { body: 'If you can read this, notifications work on this device.', tag: 'taskflow-test', icon: 'icons/icon-v4-192.png' });
      dlog('notify', 'test notification shown');
      toast('Test sent');
    } catch (e) { dlog('notify', 'test notification failed', { name: e?.name || null, message: String(e?.message || e) }); toast('Test failed. Turn on logging and copy the log.'); }
  },
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
  // a sample notification, without adding a quest (no test data in anyone's list)
  'test-remind': async () => {
    await requestPermission();
    play('click', 0.5); toast('A sample notification in 10 seconds. You can switch tabs.');
    setTimeout(() => show('Reminder: this is how a reminder looks', { body: 'Levern reminders show up like this, with Done and Snooze on quest reminders.', tag: 'test' }), 10000);
  },
  install: () => install(),
  hear: el => play(el.dataset.s, 1, +el.dataset.rate || 1),
  speed: el => { setSetting('speed', el.dataset.v); play('click', 0.4); mascot.settingsChanged(); },
  theme: el => { setSetting('theme', el.dataset.v); applyTheme(); play('click', 0.4); },
  coat: el => { setSetting('mochiColor', el.dataset.v); play('click', 0.4); mascot.settingsChanged(); },
  export: () => { download(`levern-backup-${todayStr()}.json`, exportData(), 'application/json'); toast('Backup saved'); },
  'tidy-exp': async () => {
    const st = getState(), before = summary(st.history, st.sessions, st.settings.target).exp;
    if (!await confirmBox('Remove extra same-day completions? Each quest keeps one per day. Focus time is kept.', 'Remove')) return;
    const n = tidyHistory();
    const after = summary(getState().history, getState().sessions, getState().settings.target).exp;
    toast(n ? `Removed ${n} extra completion${n === 1 ? '' : 's'}. EXP ${before} → ${after}` : 'Nothing to remove. No duplicate completions.');
  },
  'clear-done': async () => { if (await confirmBox('Remove all done quests? Your history and stats stay.', 'Clear')) { clearCompleted(); toast('Done quests cleared'); } },
  reset: async () => { if (await confirmBox('Delete all quests, history and settings on this device?', 'Reset')) { resetAll(); toast('Everything reset'); setTimeout(() => mascot.react('cry', 'my settings…'), 400); } },
};
export function onChange(el) {
  if (el.dataset.change === 'theme') {
    setSetting('theme', el.value);
    applyTheme();
    play('click', 0.4);
    rerender();
  }
  if (el.dataset.change === 'volume') { setSetting('volume', +el.value, { quiet: true }); play('click'); }
  if (el.dataset.change === 'import') {
    const f = el.files[0]; if (!f) return;
    f.text().then(async txt => {
      if (!(await confirmBox('Replace everything on this device with this backup?', 'Import'))) return;
      try { importData(txt); toast('Backup imported', 'good'); } catch (e) { toast("That file isn't a Levern backup"); }
    });
  }
}
export function onInput(el) {
  if (el.dataset.input === 'tier') { const n = getState().settings.tierNames.slice(); n[+el.dataset.i] = el.value.trim() || `P${+el.dataset.i + 1}`; setSetting('tierNames', n, { quiet: true }); }
}
function rerender() { swap(render({})); }
export { show, supported };

// Delete account: what goes, a way to keep a copy, an optional reason (anonymous, read only on the backend), and a
// tick to confirm before the button works. Then cloud.deleteAccount() removes it all.
const REASONS = ['Not using it anymore', 'Too complicated', 'Missing something I need', 'Bugs or problems', 'Privacy', 'Something else'];
function deleteFlow() {
  const d = document.getElementById('dialog');
  d.innerHTML = `<form method="dialog" class="del-form">
    <h3>Delete your account?</h3>
    <p class="small">This deletes everything Levern keeps for you: your quests, history, focus sessions, sketches and settings, the copy Solodesk reads, and your place on the leaderboard. It also clears this device. <b>It can't be undone.</b></p>
    <button type="button" class="mini" data-del="export">Download my data first</button>
    <fieldset class="del-why"><legend>Before you go, what made you leave? <span class="small">(optional)</span></legend>
      <div class="del-chips">${REASONS.map(r => `<label><input type="radio" name="reason" value="${esc(r)}"><span>${esc(r)}</span></label>`).join('')}</div>
      <textarea class="field" name="note" rows="3" maxlength="1000" placeholder="Anything else you'd like to tell us? (optional)"></textarea>
      <p class="small">Your answer is anonymous: no name, email or account is attached, and only the Levern team can read it.</p>
    </fieldset>
    <label class="del-ok"><input type="checkbox" name="sure"> I understand this can't be undone</label>
    <div class="row-btns"><button value="no" class="btn ghost">Keep my account</button><button value="yes" class="btn danger" name="go" disabled>Delete everything</button></div>
  </form>`;
  const f = d.querySelector('form'), go = f.go;
  f.sure.addEventListener('change', () => { go.disabled = !f.sure.checked; });
  d.querySelector('[data-del="export"]').addEventListener('click', () => download(`levern-backup-${todayStr()}.json`, exportData(), 'application/json'));
  d.onclose = async () => {
    if (d.returnValue !== 'yes' || !f.sure.checked) return;
    const feedback = { reason: f.reason?.value || '', note: f.note.value };
    toast('Deleting your account…');
    try {
      const r = await deleteAccount(feedback);
      toast(r.signInKept ? 'Your Levern data is deleted. Your sign-in is kept for Solodesk.' : 'Your account and all your data are deleted.', 'good');
      location.hash = '#/home';
    } catch (e) { toast("Couldn't delete everything: " + (e.message || 'please try again.')); }
  };
  d.returnValue = '';
  d.showModal();
}
