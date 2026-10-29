// Levern web app: boot, routing and shared actions.
import * as store from './store.js';
import { registerSW } from './notify.js';
import { startReminders, paintBadges } from './reminders.js';
import { watchInstall } from './install.js';
import { maybeLeaderboardNudge } from './leaderboardnudge.js';
import { startUpdatePop, isShowing as updateShowing } from './updatepop.js';
import { $, toast, play, sheet, ICON } from './ui.js';
import { completeQuest } from './complete.js';
import { pageTransition, morph, reduced, EASE } from './motion.js';
import { questRow, expanded } from './views/common.js';
import * as home from './views/home.js';
import * as quests from './views/quests.js';
import * as detail from './views/detail.js';
import * as calendar from './views/calendar.js';
import * as focus from './views/focus.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';
import * as leaderboard from './views/leaderboard.js';
import * as whatsnew from './views/whatsnew.js';
import * as profileView from './views/profile.js';
import { startProfile } from './profile.js';
import { startRankups } from './rankup.js';
import { startBoard } from './board.js';
import { startTheme } from './theme.js';
import { startNameCheck } from './namecheck.js';
import { startSync } from './sync.js';
import { openAdd } from './views/add.js';
import * as remindersPanel from './views/reminders.js';
import * as onboarding from './views/onboarding.js';
import { startCalendars, onCalendarChange } from './calendars.js';
import { createMochi, sprite } from './mochi.js';
import { preloadSounds, unlockOnGesture, sfx, sfxLog, soundsLoaded } from './sound.js';
import { mascot, setMascot } from './mascot.js';
import * as tour from './views/tour.js';
import { setupPullToRefresh } from './ptr.js';
import { checkForUpdate } from './refresh-update.js';
import { check as checkReminders } from './reminders.js';
import { syncGoogle, googleState, hasToken } from './calendars.js';
import { startControls } from './controls.js';
import { startMenu } from './menu.js';
import { startAccount } from './account.js';
import * as account from './account.js';
import * as cloud from './cloud.js';
import { initTimeWheels } from './timewheel.js';
initTimeWheels();   // the iOS-style time pickers, app-wide
import { startBack } from './back.js';
// the phone's back button or gesture closes the sheet, the reminders panel or a dialog before leaving the page
startBack([
  { el: $('#sheet'), isOpen: el => el.classList.contains('open'), close: () => sheet.close() },
  { el: $('#rpanel'), isOpen: el => el.classList.contains('open'), close: () => remindersPanel.close() },
]);

store.init();

const VIEWS = { home, quests, quest: detail, calendar, focus, stats, settings, leaderboard, whatsnew, profile: profileView };
const NAV = [['home', 'Home'], ['quests', 'Quests'], ['add'], ['calendar', 'Calendar'], ['focus', 'Focus']];
let route = { name: 'home', params: {} };

function parseHash() {
  const [path, query = ''] = (location.hash.replace(/^#\/?/, '') || 'home').split('?');
  const [name, id] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(query));
  if (id) params.id = decodeURIComponent(id);
  return { name: VIEWS[name] ? name : 'home', params };
}

function renderNav() {
  document.querySelectorAll('[data-top]').forEach(b => { const on = b.dataset.top === route.name || (route.name === 'profile' && b.dataset.top === 'leaderboard'); b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  const active = route.name === 'quest' ? 'quests' : route.name, nav = $('#nav');
  if (nav.dataset.active === active) return;   // unchanged: keep it (and its animations) as is
  nav.dataset.active = active;
  if (!document.querySelector('.navadd')) nav.insertAdjacentHTML('afterend', `<div class="navadd"><button class="add" data-act="add" aria-label="New quest">${ICON.plus}</button></div>`);
  nav.innerHTML = NAV.map(([k, label]) => k === 'add'
    ? '<span class="add-slot" aria-hidden="true"></span>'
    : `<a class="tab${k === active ? ' on' : ''}" href="#/${k}"${k === active ? ' aria-current="page"' : ''}><span class="ic">${ICON[k]}${k === 'quests' ? '<b class="rcount" data-rcount hidden></b>' : ''}</span><span>${label}</span></a>`).join('');
}

let spriteStops = [];
function draw(keep) {
  const v = VIEWS[route.name], main = $('#view');
  spriteStops.forEach(s => s());
  if (v.unmount) v.unmount();
  if (!cloud.cloudReady()) {
    // signed in: wait for the account's quests rather than show this device's old copy for a moment
    main.innerHTML = '<p class="sync-wait" role="status">Loading your quests…</p>';
    main.dataset.view = route.name;
    document.body.dataset.view = route.name;
    renderNav();
    scrollTo(0, keep);
    return;
  }
  const qlistScroll = route.name === 'quests' ? $('#qlist')?.scrollTop : 0;
  main.innerHTML = v.render(route.params);
  main.dataset.view = route.name;
  document.body.dataset.view = route.name;
  renderNav();
  if (v.mount) v.mount(main, route.params);
  spriteStops = [...main.querySelectorAll('[data-sprite]')].map(el => sprite(el, el.dataset.sprite, { scale: +el.dataset.scale || 1 }));
  scrollTo(0, keep);
  if (route.name === 'quests' && qlistScroll && $('#qlist')) $('#qlist').scrollTop = qlistScroll;
  if (remindersPanel.isOpen()) remindersPanel.render();
  paintBadges();
}
// same screen, new data: rows glide instead of jumping
function render(opts = {}) {
  if (opts.keepScroll) { const y = scrollY; morph($('#view'), () => draw(y)); }
  else draw(0);
}

// which way a screen change should drift: deeper (detail) slides forward, tabs slide by their order
const ORDER = ['home', 'quests', 'calendar', 'focus', 'stats', 'settings'];
function direction(from, to) {
  if (to.name === 'quest') return 'forward';
  if (from.name === 'quest') return 'back';
  const a = ORDER.indexOf(from.name), b = ORDER.indexOf(to.name);
  return a < 0 || b < 0 || a === b ? 'fade' : b > a ? 'right' : 'left';
}
let first = true;
function go() {
  const prev = route, next = parseHash();
  route = next;
  if (first) { first = false; draw(0); return; }
  const same = prev.name === next.name && prev.params.id === next.params.id;
  if (same) return render({ keepScroll: true });
  pageTransition(() => draw(0), direction(prev, next));
  if (prev.name !== next.name) setTimeout(() => mascot.enterPage(next.name === 'quest' ? 'quests' : next.name), 420);
  if (prev.name !== next.name && NAV.some(([k]) => k === next.name)) sfx('tab');   // nav bar screens
  const main = $('#view');
  main.classList.add('entering'); setTimeout(() => main.classList.remove('entering'), 900);
  main.focus({ preventScroll: true });
}
addEventListener('hashchange', go);
store.subscribe((s, opts) => render({ keepScroll: true, ...opts }));
// the account's quests arrived (or sign-in started): redraw once when that changes
let cloudWasReady = cloud.cloudReady();
cloud.onCloud(() => { if (cloud.cloudReady() !== cloudWasReady) { cloudWasReady = cloud.cloudReady(); render({ keepScroll: true }); } });

/* ---------- shared actions (data-act="...") ---------- */
const ACTIONS = {
  'more-quests': () => {
    play('click', 0.4);
    if (location.hash === '#/quests?filter=all') {
      route = { name: 'quests', params: { filter: 'all' } };
      draw(0);
    } else {
      location.hash = '#/quests?filter=all';
    }
  },
  toggle: el => completeQuest(el.dataset.id),
  open: el => { location.hash = '#/quest/' + el.dataset.id; },
  add: el => openAdd({ due: el.dataset.due }),
  bell: () => remindersPanel.toggle(),
  onboard: () => onboarding.open(() => tour.start()),
  tour: () => tour.start(),
  // a quest row opens and closes in place
  expand: el => {
    const id = el.dataset.id, q = store.findQuest(id), row = el.closest('.q');
    if (!q || !row) return;
    const opening = !expanded.has(id);
    opening ? expanded.add(id) : expanded.delete(id);
    play('click', 0.35);
    const tmp = document.createElement('div'); tmp.innerHTML = questRow(q);
    const next = tmp.firstElementChild;
    row.replaceWith(next);
    next.querySelector('.qb')?.focus({ preventScroll: true });
    const panel = next.querySelector('.qx');
    if (panel && !reduced()) panel.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
  },
  'sub-toggle': el => {
    const q = store.findQuest(el.dataset.id), s = q?.subtasks.find(x => x.id === el.dataset.sid);
    if (!s) return;
    const nowDone = !s.done; store.updateSubtask(q.id, s.id, { done: nowDone }); if (nowDone) { ui.play('coin', 0.5); ui.toast('+2 EXP · Subtask complete', 'good'); } else ui.play('tap', 0.6);
    play(s.done ? 'tick' : 'click', 0.5);
  },
};
// long-press a quest to edit it (touch, pen or mouse held); a right-click still opens the quest menu
let press = null, pressedAt = 0;
const endPress = () => { if (press) { clearTimeout(press.t); press = null; } };
document.addEventListener('pointerdown', e => {
  const qb = e.target.closest('.q .qb');
  if (!qb || e.button > 0) return;
  endPress();
  press = { x: e.clientX, y: e.clientY, t: setTimeout(() => {
    press = null; pressedAt = Date.now();
    try { navigator.vibrate?.(12); } catch (err) {}
    location.hash = '#/quest/' + qb.dataset.id;
  }, 520) };
});
document.addEventListener('pointermove', e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) endPress(); });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, endPress));
addEventListener('scroll', endPress, true);
// the click that ends a long press must not also open/close the row
document.addEventListener('click', e => { if (Date.now() - pressedAt < 700 && e.target.closest('.q')) { e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#sheet')) return;
  const name = el.dataset.act, v = VIEWS[route.name];
  const fn = (v.actions && v.actions[name]) || ACTIONS[name] || remindersPanel.actions[name];
  if (fn) { e.preventDefault(); fn(el, e); }
});
const fieldHandler = kind => e => {
  const el = e.target.closest(`[data-${kind}]`);
  if (!el || el.closest('#sheet')) return;
  const v = VIEWS[route.name], fn = v[kind === 'change' ? 'onChange' : 'onInput'];
  if (fn) fn(el, e);
};
document.addEventListener('change', fieldHandler('change'));
document.addEventListener('input', fieldHandler('input'));
$('#scrim').addEventListener('click', () => sheet.close());
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && tour.isOpen()) return tour.end();
  if (e.key === 'Escape') { if (sheet.isOpen()) sheet.close(); else if (remindersPanel.isOpen()) remindersPanel.close(); }
  // "n" opens the add sheet when not typing
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !sheet.isOpen() && !onboarding.isOpen() && !tour.isOpen()) { e.preventDefault(); openAdd(); }
});

/* ---------- install prompt ---------- */
// the install offer lives in Settings; when it changes, redraw Settings
watchInstall(() => { if (route.name === 'settings') render({ keepScroll: true }); });
addEventListener('appinstalled', () => toast('Levern installed'));
addEventListener('online', () => toast('Back online')); addEventListener('offline', () => toast("You're offline. Everything still works."));

/* ---------- start ---------- */
$('#top-actions').innerHTML = `<button class="iconbtn bell" data-act="bell" aria-label="Reminders">${ICON.bell}<b class="rcount" data-rcount hidden></b></button>
  <a class="iconbtn" href="#/stats" aria-label="Stats" data-top="stats">${ICON.stats}</a><a class="iconbtn" href="#/leaderboard" aria-label="Leaderboard" data-top="leaderboard">${ICON.trophy}</a><a class="iconbtn" href="#/settings" aria-label="Settings" data-top="settings">${ICON.settings}</a>`;
unlockOnGesture();
preloadSounds();
startControls();
startMenu();
startAccount();
startBoard();
startProfile();
startRankups();
startTheme();
go();
// Mochi lives on the nav bar
const mochi = createMochi({
  current: () => route.name === 'quest' ? 'quests' : route.name,
  quests: () => store.getState().quests,
  paused: () => onboarding.isOpen() || tour.isOpen(),
  onTap: () => tour.mochiTapped(),
  onDrop: () => tour.mochiDropped(),
  onHoldTap: () => { if (!remindersPanel.isOpen()) remindersPanel.open(); },
});
setMascot(mochi);
mochi.start();
mascot.setVisible(store.getState().settings.mochi !== false);
// a saved name with a swear word or slur must be replaced (after the welcome screens and the account's copy loading)
startNameCheck(() => onboarding.isOpen() || !cloud.cloudReady());
setupPullToRefresh({
  current: () => route.name,
  refresh: async () => {
    if (cloud.cloudOn()) {
      await cloud.syncNow().catch(() => {});
    }
    if (googleState().connected && hasToken()) {
      await syncGoogle({ interactive: false }).catch(() => {});
    }
    try {
      const board = await import('./board.js');
      if (board.isOn()) {
        board.publish().catch(() => {});
        board.entries({ fresh: true }).catch(() => {});
      }
    } catch (e) {}
    await checkReminders();
    const updated = await checkForUpdate();
    render({ keepScroll: true });
    return { updated };
  },
});
document.addEventListener('sheet:open', () => mascot.setPerch('sheet'));
document.addEventListener('sheet:close', () => mascot.setPerch('nav'));
// the visible screen height on phones (address bar, on-screen keyboard), for sheets: --vvh and --kb
const vv = window.visualViewport;
// pinch-zoomed too: vv.height and vv.offsetTop describe what is on screen at the current zoom, so the
// sheet keeps its top and fields in view instead of staying sized for the unzoomed page
const fitViewport = () => {
  if (!vv) return;
  const layout = document.documentElement.clientHeight;
  document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  document.documentElement.style.setProperty('--kb', `${Math.max(0, Math.round(layout - vv.height - vv.offsetTop))}px`);
};
vv?.addEventListener('resize', fitViewport); vv?.addEventListener('scroll', fitViewport); fitViewport();
// a field focused in a sheet scrolls into the visible part once the keyboard is up
$('#sheet').addEventListener('focusin', e => { if (e.target.matches('input, textarea')) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320); });

// Levern needs a signed-in account: signed out, you're back at the start of the welcome screens
// signed out on a device that has been set up: go straight to the sign-in step, not the welcome screens again
const signInStep = () => (onboarding.deviceSetupDone() ? { startAt: 'account' } : {});
const toStart = () => { if (!onboarding.isOpen()) { sheet.close(); location.hash = '#/home'; onboarding.open(() => tour.start(), signInStep()); } };
if (account.cameBackFromRedirect()) onboarding.resumeSignIn(() => tour.start());   // phone sign-in came back to a fresh page
else if (!onboarding.deviceSetupDone() || !account.user()) onboarding.open(() => tour.start(), account.user() ? {} : signInStep());
// set up before and signed in: a reload goes straight to the app. The tour question is asked after an actual sign-in (onboarding.js).
if (!account.user()) account.preload();   // ready before the sign-in tap, so Google's popup isn't blocked
account.onAccount(u => { if (!u) setTimeout(toStart, 0); });   // after sign-out has cleared the device
registerSW().finally(() => { startReminders(); if ('Notification' in window && Notification.permission === 'granted') import('./push.js').then(m => m.enablePush()); });
// a friendly nudge to check the leaderboard (at most twice a day), once the app has settled
setTimeout(() => { if (account.user() && !onboarding.isOpen() && !updateShowing()) maybeLeaderboardNudge(); }, 4000);
// What's new: once per person per update, on whichever device opens first
startUpdatePop(onboarding.isOpen);
startCalendars();
// share data with the local Levern server when there is one (npm start); the app works the same without it
startSync();
onCalendarChange(() => { if (route.name === 'settings' || route.name === 'calendar') render({ keepScroll: true }); });
if (new URLSearchParams(location.search).get('add') === '1') openAdd();
window.TaskFlow = window.Levern = { store, go: h => { location.hash = h; }, mochi, tour, sfxLog, soundsLoaded };   // handy in the console
