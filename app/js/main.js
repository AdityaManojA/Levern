// TaskFlow web app: boot, routing and shared actions.
import * as store from './store.js';
import { registerSW } from './notify.js';
import { startReminders, paintBadges } from './reminders.js';
import { watchInstall } from './install.js';
import { $, toast, play, sheet, ICON } from './ui.js';
import { completeQuest } from './complete.js';
import * as home from './views/home.js';
import * as quests from './views/quests.js';
import * as detail from './views/detail.js';
import * as calendar from './views/calendar.js';
import * as focus from './views/focus.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';
import { openAdd } from './views/add.js';
import * as remindersPanel from './views/reminders.js';

store.init();

const VIEWS = { home, quests, quest: detail, calendar, focus, stats, settings };
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
  const active = route.name === 'quest' ? 'quests' : route.name;
  $('#nav').innerHTML = NAV.map(([k, label]) => k === 'add'
    ? `<button class="add" data-act="add" aria-label="New quest">${ICON.plus}</button>`
    : `<a class="tab${k === active ? ' on' : ''}" href="#/${k}"${k === active ? ' aria-current="page"' : ''}><span class="ic">${ICON[k]}${k === 'quests' ? '<b class="rcount" data-rcount hidden></b>' : ''}</span><span>${label}</span></a>`).join('');
}

function render(opts = {}) {
  const v = VIEWS[route.name], main = $('#view');
  const keep = opts.keepScroll ? scrollY : 0;
  if (v.unmount) v.unmount();
  main.innerHTML = v.render(route.params);
  main.dataset.view = route.name;
  renderNav();
  if (v.mount) v.mount(main, route.params);
  scrollTo(0, keep);
  if (remindersPanel.isOpen()) remindersPanel.render();
  paintBadges();
}

function go() {
  const prev = route.name;
  route = parseHash();
  render();
  if (prev !== route.name) $('#view').focus({ preventScroll: true });
}
addEventListener('hashchange', go);
store.subscribe((s, opts) => render({ keepScroll: true, ...opts }));

/* ---------- shared actions (data-act="...") ---------- */
const ACTIONS = {
  toggle: el => completeQuest(el.dataset.id),
  open: el => { location.hash = '#/quest/' + el.dataset.id; },
  add: el => openAdd({ due: el.dataset.due }),
  bell: () => remindersPanel.toggle(),
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
  if (e.key === 'Escape') { if (sheet.isOpen()) sheet.close(); else if (remindersPanel.isOpen()) remindersPanel.close(); }
  // "n" opens the add sheet when not typing
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !sheet.isOpen()) { e.preventDefault(); openAdd(); }
});

/* ---------- install prompt ---------- */
watchInstall(() => { if (route.name === 'settings') render({ keepScroll: true }); });
addEventListener('appinstalled', () => toast('TaskFlow installed'));
addEventListener('online', () => toast('Back online')); addEventListener('offline', () => toast("You're offline. Everything still works."));

/* ---------- start ---------- */
$('#top-actions').innerHTML = `<button class="iconbtn bell" data-act="bell" aria-label="Reminders">${ICON.bell}<b class="rcount" data-rcount hidden></b></button>
  <a class="iconbtn" href="#/stats" aria-label="Stats">${ICON.stats}</a><a class="iconbtn" href="#/settings" aria-label="Settings">${ICON.settings}</a>`;
go();
registerSW().finally(startReminders);
if (new URLSearchParams(location.search).get('add') === '1') openAdd();
window.TaskFlow = { store, go: h => { location.hash = h; } };   // handy in the console
