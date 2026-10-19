// TaskFlow web app: boot, routing and shared actions.
import * as store from './store.js';
import { registerSW } from './notify.js';
import { startReminders, paintBadges } from './reminders.js';
import { watchInstall } from './install.js';
import { $, toast, play, sheet, ICON } from './ui.js';
import { completeQuest } from './complete.js';
import { pageTransition, morph } from './motion.js';
import * as home from './views/home.js';
import * as quests from './views/quests.js';
import * as detail from './views/detail.js';
import * as calendar from './views/calendar.js';
import * as focus from './views/focus.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';
import * as developer from './views/developer.js';
import { startSync, onSyncStatus } from './sync.js';
import { openAdd } from './views/add.js';
import * as remindersPanel from './views/reminders.js';
import * as onboarding from './views/onboarding.js';
import { startCalendars, onCalendarChange } from './calendars.js';
import { createMochi, sprite } from './mochi.js';
import { preloadSounds, unlockOnGesture, sfx, sfxLog, soundsLoaded } from './sound.js';
import { mascot, setMascot } from './mascot.js';
import * as tour from './views/tour.js';
import { setupPullToRefresh } from './ptr.js';
import { check as checkReminders } from './reminders.js';
import { syncGoogle, googleState, hasToken } from './calendars.js';
import { startControls } from './controls.js';
import { startMenu } from './menu.js';
import { startAccount } from './account.js';
import * as account from './account.js';

store.init();

const VIEWS = { home, quests, quest: detail, calendar, focus, stats, settings, developer };
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
  const active = route.name === 'quest' ? 'quests' : route.name, nav = $('#nav');
  if (nav.dataset.active === active) return;   // unchanged: keep it (and its animations) as is
  nav.dataset.active = active;
  nav.innerHTML = NAV.map(([k, label]) => k === 'add'
    ? `<button class="add" data-act="add" aria-label="New quest">${ICON.plus}</button>`
    : `<a class="tab${k === active ? ' on' : ''}" href="#/${k}"${k === active ? ' aria-current="page"' : ''}><span class="ic">${ICON[k]}${k === 'quests' ? '<b class="rcount" data-rcount hidden></b>' : ''}</span><span>${label}</span></a>`).join('');
}

let spriteStops = [];
function draw(keep) {
  const v = VIEWS[route.name], main = $('#view');
  spriteStops.forEach(s => s());
  if (v.unmount) v.unmount();
  main.innerHTML = v.render(route.params);
  main.dataset.view = route.name;
  renderNav();
  if (v.mount) v.mount(main, route.params);
  spriteStops = [...main.querySelectorAll('[data-sprite]')].map(el => sprite(el, el.dataset.sprite, { scale: +el.dataset.scale || 1 }));
  scrollTo(0, keep);
  if (remindersPanel.isOpen()) remindersPanel.render();
  paintBadges();
}
// same screen, new data: rows glide instead of jumping
function render(opts = {}) {
  if (opts.keepScroll) { const y = scrollY; morph($('#view'), () => draw(y)); }
  else draw(0);
}

// which way a screen change should drift: deeper (detail) slides forward, tabs slide by their order
const ORDER = ['home', 'quests', 'calendar', 'focus', 'stats', 'settings', 'developer'];
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

/* ---------- shared actions (data-act="...") ---------- */
const ACTIONS = {
  toggle: el => completeQuest(el.dataset.id),
  open: el => { location.hash = '#/quest/' + el.dataset.id; },
  add: el => openAdd({ due: el.dataset.due }),
  bell: () => remindersPanel.toggle(),
  onboard: () => onboarding.open(() => tour.start()),
  tour: () => tour.start(),
};
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
watchInstall(() => { if (route.name === 'settings') render({ keepScroll: true }); });
addEventListener('appinstalled', () => toast('TaskFlow installed'));
addEventListener('online', () => toast('Back online')); addEventListener('offline', () => toast("You're offline. Everything still works."));

/* ---------- start ---------- */
$('#top-actions').innerHTML = `<button class="iconbtn bell" data-act="bell" aria-label="Reminders">${ICON.bell}<b class="rcount" data-rcount hidden></b></button>
  <a class="iconbtn" href="#/stats" aria-label="Stats">${ICON.stats}</a><a class="iconbtn" href="#/settings" aria-label="Settings">${ICON.settings}</a>`;
unlockOnGesture();
preloadSounds();
startControls();
startMenu();
startAccount();
go();
// Mochi lives on the nav bar
const mochi = createMochi({
  current: () => route.name === 'quest' ? 'quests' : route.name,
  quests: () => store.getState().quests,
  paused: () => onboarding.isOpen() || tour.isOpen(),
  onTap: () => tour.mochiTapped(),
  onHoldTap: () => { if (!remindersPanel.isOpen()) remindersPanel.open(); },
});
setMascot(mochi);
mochi.start();
mascot.setVisible(store.getState().settings.mochi !== false);
setupPullToRefresh({
  current: () => route.name,
  refresh: async () => {
    await checkReminders();
    if (googleState().connected && hasToken()) await syncGoogle({ interactive: false }).catch(() => {});
    try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch (e) {}
    render({ keepScroll: true });
  },
});
document.addEventListener('sheet:open', () => mascot.setPerch('sheet'));
document.addEventListener('sheet:close', () => mascot.setPerch('nav'));
// TaskFlow needs a signed-in account: signed out, you're back at the start of the welcome screens
const toStart = () => { if (!onboarding.isOpen()) { sheet.close(); location.hash = '#/home'; onboarding.open(() => tour.start()); } };
if (!store.getState().onboarded || !account.user()) onboarding.open(() => tour.start());
account.onAccount(u => { if (!u) setTimeout(toStart, 0); });   // after sign-out has cleared the device
registerSW().finally(startReminders);
startCalendars();
// share data with the TaskFlow server (API, webhooks); the app works the same without it
startSync();
onSyncStatus(() => { if (route.name === 'developer') render({ keepScroll: true }); });
onCalendarChange(() => { if (route.name === 'settings' || route.name === 'calendar') render({ keepScroll: true }); });
if (new URLSearchParams(location.search).get('add') === '1') openAdd();
window.TaskFlow = { store, go: h => { location.hash = h; }, mochi, tour, sfxLog, soundsLoaded };   // handy in the console
