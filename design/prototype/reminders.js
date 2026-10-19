/* TaskFlow reminders.
   A quest can carry a reminder (q.remind = { at, fired, snoozed }). When its time comes the reminder
   is "due": it shows as a system notification (Notification API, asked for the first time you set
   one), an in-app toast, and in the red count badge on the bell and the Quests tab. A due reminder
   stays in the count until you finish the quest, snooze it or dismiss it.
   Notifications only fire while the prototype is open in a tab; there is no push server. */
window.TaskflowReminders = function (api) {
  const $ = s => document.querySelector(s);
  const INK = '#1E1B18';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BELL = (w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>`;
  const SNOOZE_MIN = 10;
  const canNotify = 'Notification' in window;
  const baseTitle = document.title;

  /* ---------- times ---------- */
  const at = (h, m = 0, addDays = 0) => { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, m, 0, 0); return +d; };
  const PRESETS = [
    ['1m', 'In 1 min', () => Date.now() + 60e3],
    ['15m', 'In 15 min', () => Date.now() + 15 * 60e3],
    ['1h', 'In 1 hour', () => Date.now() + 60 * 60e3],
    ['eve', 'Tonight 8 pm', () => at(20) > Date.now() ? at(20) : at(20, 0, 1)],
    ['tom', 'Tomorrow 9 am', () => at(9, 0, 1)],
    ['custom', 'Pick a time', null],
  ];
  function when(t) {
    const d = new Date(t), now = new Date(), diff = t - Date.now();
    const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diff > 0 && diff < 60e3) return `in ${Math.ceil(diff / 1000)} s`;
    if (diff > 0 && diff < 60 * 60e3) return `in ${Math.round(diff / 60e3)} min`;
    if (d.toDateString() === now.toDateString()) return `today ${hm}`;
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    if (d.toDateString() === tom.toDateString()) return `tomorrow ${hm}`;
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + hm;
  }
  const localInput = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };

  /* ---------- state ---------- */
  const isDue = q => q.remind && q.remind.fired && !q.done;
  const due = () => api.quests().filter(isDue);
  const upcoming = () => api.quests().filter(q => q.remind && !q.remind.fired && !q.done).sort((a, b) => a.remind.at - b.remind.at);
  function set(q, t) {
    if (t == null) { delete q.remind; } else { q.remind = { at: t, fired: false }; askPermission(); }
    refresh();
  }

  /* ---------- system notifications ---------- */
  function permission() { return canNotify ? Notification.permission : 'unsupported'; }
  function askPermission() {
    if (!canNotify || Notification.permission !== 'default' || !api.settings().notify) return Promise.resolve(permission());
    return Notification.requestPermission().then(p => { api.onPermission && api.onPermission(p); return p; }).catch(() => permission());
  }
  function systemNotify(q, count) {
    if (!canNotify || Notification.permission !== 'granted' || !api.settings().notify) return false;
    try {
      const n = new Notification(`Reminder: ${q.title}`, {
        body: `${api.tierLabel(q.tier)} · ${q.meta}\n${count} reminder${count === 1 ? '' : 's'} due in TaskFlow`,
        tag: 'taskflow-' + q.id, renotify: true, icon: '../mochi/png/lookup.png', badge: '../mochi/png/sit.png',
      });
      n.onclick = () => { window.focus(); api.go('quests'); openPanel(); n.close(); };
      return true;
    } catch (e) { return false; }   // e.g. Android Chrome only allows notifications from a service worker
  }

  /* ---------- checking ---------- */
  function check() {
    const fresh = api.quests().filter(q => q.remind && !q.remind.fired && !q.done && q.remind.at <= Date.now());
    if (!fresh.length) return paint(false);
    fresh.forEach(q => { q.remind.fired = true; });
    const count = due().length;
    fresh.forEach(q => systemNotify(q, count));
    const q = fresh[0];
    api.toast(fresh.length > 1 ? `${fresh.length} reminders due` : `Reminder: ${q.title}`, 'info');
    api.play('mew', { rate: 1.15 });
    api.Mochi.react('notify', 0, count > 1 ? `${count} reminders!` : 'reminder!');
    refresh(true);
  }

  /* ---------- badge ---------- */
  function paint(ring) {
    const n = due().length, txt = n > 99 ? '99+' : String(n);
    document.querySelectorAll('[data-rcount]').forEach(b => { b.textContent = txt; b.hidden = n === 0; });
    const tab = document.querySelector('.tab[data-tab="quests"] .ic');
    if (tab && !tab.querySelector('[data-rcount]')) { tab.insertAdjacentHTML('beforeend', `<b class="rcount" data-rcount>${txt}</b>`); if (!n) tab.lastElementChild.hidden = true; }
    $('#rbtn').setAttribute('aria-label', n ? `${n} reminder${n === 1 ? '' : 's'} due` : 'Reminders');
    document.title = n ? `(${txt}) ${baseTitle}` : baseTitle;
    try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) {}
    if (ring) { const b = $('#rbtn'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }
  }
  function refresh(ring) { api.render(); paint(ring); if (panelOpen) renderPanel(); }

  /* ---------- quest card bits ---------- */
  function chip(q) {
    if (!q.remind || q.done) return '';
    return isDue(q) ? ' <span class="rchip due">due now</span>' : ` <span class="rchip">⏰ ${esc(when(q.remind.at))}</span>`;
  }
  function bellButton(q) {
    return `<button class="rbell${q.remind && !q.done ? ' set' : ''}" data-remind aria-label="Set reminder">${BELL()}</button>`;
  }

  /* ---------- picker (used in the add sheet and in the panel for an existing quest) ---------- */
  function pickerHTML(id, sel) {
    return `<div class="ropts" data-ropts="${id}">${[['none', 'None'], ...PRESETS].map(([k, l]) => `<button data-r="${k}" class="${k === sel ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="rcustom${sel === 'custom' ? ' on' : ''}"><input type="datetime-local" data-rinput="${id}" value="${localInput(Date.now() + 30 * 60e3)}"></div>`;
  }
  function pickerValue(root) {
    const k = root.querySelector('.ropts .on')?.dataset.r || 'none';
    if (k === 'none') return null;
    if (k === 'custom') { const v = root.querySelector('[data-rinput]').value; const t = v ? +new Date(v) : NaN; return isNaN(t) ? null : t; }
    return PRESETS.find(p => p[0] === k)[2]();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.ropts button'); if (!b) return;
    const box = b.parentElement;
    box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    box.nextElementSibling.classList.toggle('on', b.dataset.r === 'custom');
    api.play('click', { vol: .6 });
    if (b.dataset.r !== 'none') askPermission();   // ask inside the tap, so the browser shows the prompt
    if (box.dataset.ropts.startsWith('edit:')) applyEdit(box.dataset.ropts.slice(5));
  });
  document.addEventListener('change', e => { const i = e.target.closest('[data-rinput^="edit:"]'); if (i) applyEdit(i.dataset.rinput.slice(5)); });

  // add sheet
  const sheetBox = $('#remind-pick');
  function resetSheet() { sheetBox.innerHTML = pickerHTML('sheet', 'none'); }
  function sheetValue() { return pickerValue(sheetBox); }

  /* ---------- panel ---------- */
  let panelOpen = false, editing = null;
  const panel = $('#rpanel');
  function openPanel(q) { editing = q ? q.id : null; panelOpen = true; renderPanel(); panel.classList.add('open'); }
  function closePanel() { panelOpen = false; editing = null; panel.classList.remove('open'); }
  function applyEdit(id) {
    const q = api.quests().find(x => String(x.id) === id); if (!q) return;
    const t = pickerValue(panel), key = panel.querySelector('.ropts .on')?.dataset.r;
    if (key === 'custom' && t == null) return;   // waiting for a time to be picked
    set(q, t);
    if (t == null) return api.toast('Reminder removed');
    api.toast(`Reminder set · ${when(t)}`);
    if (key !== 'custom') closePanel();
  }
  function renderPanel() {
    const head = (t, sub) => `<div class="rhead"><b>${t}</b><button class="mini" data-rclose style="height:32px">Close</button></div><div class="small">${sub}</div>`;
    if (editing != null) {
      const q = api.quests().find(x => x.id === editing);
      if (!q) return closePanel();
      const sel = q.remind && !q.done ? 'custom' : 'none';
      panel.innerHTML = head('Remind me', esc(q.title)) + `<div style="height:10px"></div>` + pickerHTML('edit:' + q.id, sel) +
        (sel === 'custom' ? `<div class="small rnote">Currently ${esc(when(q.remind.at))}.</div>` : '') + permNote();
      if (sel === 'custom') panel.querySelector('[data-rinput]').value = localInput(q.remind.at);
      return;
    }
    const d = due(), u = upcoming();
    const item = (q, isD) => `<div class="ritem${isD ? '' : ' upcoming'}" style="--c:${api.tierColor(q.tier)}">
        <div class="rt">${esc(q.title)}</div><div class="rw">${api.tierLabel(q.tier)} · ${isD ? 'due ' + esc(when(q.remind.at)) : esc(when(q.remind.at))}</div>
        <div class="ract">${isD ? `<button class="pri" data-rdone="${q.id}">Done</button><button data-rsnooze="${q.id}">Snooze ${SNOOZE_MIN} min</button>` : `<button data-redit="${q.id}">Change</button>`}<button data-rclear="${q.id}">${isD ? 'Dismiss' : 'Remove'}</button></div>
      </div>`;
    panel.innerHTML = head('Reminders', d.length ? `${d.length} due now` : 'Nothing due right now') +
      d.map(q => item(q, true)).join('') +
      (u.length ? `<div class="sec">Coming up</div>` + u.map(q => item(q, false)).join('') : '') +
      (!d.length && !u.length ? `<div class="rempty small">No reminders yet. Tap the bell on a quest to add one.</div>` : '') + permNote();
  }
  function permNote() {
    const p = permission();
    if (!api.settings().notify) return `<div class="small rnote">System notifications are off in Customise. Reminders still show here.</div>`;
    if (p === 'granted') return '';
    if (p === 'denied') return `<div class="small rnote">Notifications are blocked for this site, so reminders only show inside TaskFlow.</div>`;
    if (p === 'unsupported') return `<div class="small rnote">This browser has no system notifications, so reminders show inside TaskFlow.</div>`;
    return `<div class="small rnote">Allow notifications to get reminders outside the app. <button class="play" data-rallow>Allow</button></div>`;
  }
  panel.addEventListener('click', e => {
    const g = a => e.target.closest(`[data-${a}]`)?.dataset[a.replace(/-(\w)/g, (_, c) => c.toUpperCase())];
    const find = id => api.quests().find(x => String(x.id) === id);
    if (e.target.closest('[data-rclose]')) return closePanel();
    if (e.target.closest('[data-rallow]')) return askPermission().then(() => renderPanel());
    let id;
    if ((id = g('rdone'))) { const q = find(id); if (q && !q.done) api.toggleDone(q); return refresh(); }
    if ((id = g('rsnooze'))) { const q = find(id); q.remind = { at: Date.now() + SNOOZE_MIN * 60e3, fired: false, snoozed: true }; api.play('click', { vol: .6 }); api.toast(`Snoozed for ${SNOOZE_MIN} min`); return refresh(); }
    if ((id = g('rclear'))) { const q = find(id); delete q.remind; api.play('click', { vol: .6 }); return refresh(); }
    if ((id = g('redit'))) { editing = +id || id; return renderPanel(); }
  });
  $('#rbtn').addEventListener('click', () => { api.play('click', { vol: .6 }); panelOpen && editing == null ? closePanel() : openPanel(); });

  setInterval(check, 1000);
  document.addEventListener('visibilitychange', check);
  // keep "in 40 s" style labels fresh on the cards
  setInterval(() => { if (upcoming().some(q => q.remind.at - Date.now() < 60 * 60e3)) { api.render(); if (panelOpen && editing == null) renderPanel(); } }, 15e3);
  resetSheet();

  return { chip, bellButton, set, resetSheet, sheetValue, openFor: q => openPanel(q), open: () => openPanel(), close: closePanel, paint, check, permission, askPermission, due, when };
};
