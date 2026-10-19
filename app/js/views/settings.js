import { getState, setSetting, exportData, importData, clearCompleted, resetAll, addQuest, setReminder, TIER_COLORS } from '../store.js';
import { permission, requestPermission, supported, show, hasPeriodicSync } from '../notify.js';
import { canInstall, install, isInstalled } from '../install.js';
import { swap } from '../motion.js';
import { esc, toast, play, confirmBox, download } from '../ui.js';
import { todayStr } from '../dates.js';

const tog = (k, on, label) => `<button class="tog" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="tog" data-k="${k}"></button>`;
const step = (k, v, unit = '') => `<div class="step"><button data-act="step" data-k="${k}" data-d="-1" aria-label="Less">−</button><b>${v}${unit}</b><button data-act="step" data-k="${k}" data-d="1" aria-label="More">+</button></div>`;
const LIMITS = { target: [1, 10], focusMin: [5, 90], breakMin: [1, 30], snoozeMin: [5, 60] };
const STEPS = { target: 1, focusMin: 5, breakMin: 1, snoozeMin: 5 };

export function render() {
  const s = getState().settings, p = permission();
  const pText = { granted: 'Allowed. Reminders pop up even when TaskFlow is in the background.', denied: 'Blocked in your browser settings for this site. Reminders still show in the app.',
    default: 'Not asked yet.', unsupported: 'This browser has no system notifications. Reminders show in the app.' }[p];
  return `
    <div class="h-sub">Make TaskFlow yours</div>
    <h1 class="h-title">Settings</h1>

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

    <div class="sec">Sound</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Sounds</b><small>Key click on ticks, coin on targets</small></div>${tog('sound', s.sound, 'Sounds')}</div>
      <div class="srow"><div class="l"><b>Volume</b></div><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-change="volume" aria-label="Volume"></div>
    </div>

    <div class="sec">App</div>
    <div class="card">
      <div class="srow"><div class="l"><b>Install TaskFlow</b><small>${isInstalled() ? 'Installed. Running as an app.' : canInstall() ? 'Adds it to your home screen or Start menu and works offline.' : 'Use your browser menu: "Install app" (Chrome/Edge) or Share → "Add to Home Screen" (Safari).'}</small></div>
        ${canInstall() && !isInstalled() ? '<button class="mini" data-act="install">Install</button>' : ''}</div>
      <div class="srow"><div class="l"><b>Offline</b><small>${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'Ready. TaskFlow works without internet.' : 'Getting ready (reload once to finish).'}</small></div></div>
    </div>

    <div class="sec">Your data</div>
    <div class="card">
      <p class="small" style="margin-bottom:10px">Everything is saved on this device only. Export a backup to move it to another device.</p>
      <div class="row-btns"><button class="btn white sm" data-act="export">Export backup</button><label class="btn white sm" style="cursor:pointer">Import backup<input type="file" accept="application/json,.json" data-change="import" hidden></label></div>
      <div style="height:8px"></div>
      <div class="row-btns"><button class="btn ghost sm" data-act="clear-done">Clear done quests</button><button class="btn ghost sm" data-act="reset">Reset everything</button></div>
    </div>
    <p class="small" style="text-align:center;margin:16px 0">TaskFlow web 0.1 · light mode</p>`;
}

export const actions = {
  tog: async el => {
    const k = el.dataset.k, on = !getState().settings[k];
    setSetting(k, on); play('click', 0.5);
    if (k === 'notify' && on) { await requestPermission(); rerender(); }
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
  export: () => { download(`taskflow-backup-${todayStr()}.json`, exportData(), 'application/json'); toast('Backup saved'); },
  'clear-done': async () => { if (await confirmBox('Remove all done quests? Your history and stats stay.', 'Clear')) { clearCompleted(); toast('Done quests cleared'); } },
  reset: async () => { if (await confirmBox('Delete all quests, history and settings on this device?', 'Reset')) { resetAll(); toast('Everything reset'); } },
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
  if (el.dataset.input === 'tier') { const n = getState().settings.tierNames.slice(); n[+el.dataset.i] = el.value.trim() || `P${+el.dataset.i + 1}`; setSetting('tierNames', n, { quiet: true }); }
}
function rerender() { swap(render({})); }
export { show, supported };
