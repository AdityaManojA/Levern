// First-run onboarding (design/DESIGN_BRIEF.md → "Onboarding"), without Mochi and without the tour.
// Shown once (state.onboarded); Settings → "Show the welcome screens again" reopens it.
// Copy rule from the brief: every game word gets a plain meaning the first time it appears.
import { getState, setSetting, applyStarter, finishOnboarding, TIER_COLORS } from '../store.js';
import { dayExp } from '../stats.js';
import { permission, requestPermission, supported } from '../notify.js';
import { canInstall, install, isInstalled } from '../install.js';
import { speechSupported } from '../speech.js';
import { esc, play, ICON } from '../ui.js';
import { EASE, EASE_IN, reduced } from '../motion.js';

const STEPS = ['welcome', 'quests', 'you', 'target', 'yours', 'done'];
let step = 0, root = null, profile = '';

const MEANING = ['due today, blocking', 'due in 1–2 days', 'planned this week', 'the default', 'nice to do', 'ideas, no deadline'];

function screen(name) {
  const s = getState().settings;
  switch (name) {
    case 'welcome': return `
      <div class="ob-hero"><img src="icons/icon.svg" alt="" width="96" height="96"></div>
      <h1 class="ob-h">Welcome to TaskFlow</h1>
      <p class="ob-p">A calm to-do list that feels like a game.</p>
      <p class="ob-p small">Finish tasks, keep a streak, earn points. No pressure.</p>`;
    case 'quests': return `
      <h1 class="ob-h">What's a quest?</h1>
      <p class="ob-p">A <b>quest</b> is simply a task. Each one has a priority colour.</p>
      <div class="ob-examples">
        ${[['Submit lab report', 0, 'Due today, 5 pm'], ['Read chapter 4', 2, 'This week'], ['Tidy desk', 4, 'When free']].map(([t, p, m]) => `
          <div class="q" style="--c:${TIER_COLORS[p]}"><span class="chk" aria-hidden="true"></span><span class="qb"><span class="qt">${t}</span><span class="qm"><span>P${p + 1} · ${esc(s.tierNames[p])}</span><span>${m}</span></span></span></div>`).join('')}
      </div>
      <p class="ob-p small" style="margin-top:6px">Warmer means sooner:</p>
      <div class="ob-tiers">${TIER_COLORS.map((c, i) => `<div><i style="--c:${c}">P${i + 1}</i><span><b>${esc(s.tierNames[i])}</b> ${MEANING[i]}</span></div>`).join('')}</div>`;
    case 'you': return `
      <h1 class="ob-h">About you</h1>
      <label class="lbl" for="ob-name" style="margin-top:4px">What should we call you? <span class="small">(optional)</span></label>
      <input class="field" id="ob-name" data-ob="name" value="${esc(s.name)}" maxlength="30" autocomplete="given-name" placeholder="Your name">
      <label class="lbl">What will you use TaskFlow for?</label>
      <div class="ob-choices" role="radiogroup">
        ${[['student', 'Student', 'Classes, homework, exams'], ['work', 'Work', 'Projects, meetings, emails'], ['personal', 'Personal', 'Home, health, people']].map(([k, l, d]) => `
          <button type="button" role="radio" aria-checked="${profile === k}" class="ob-choice${profile === k ? ' on' : ''}" data-ob-profile="${k}"><b>${l}</b><span>${d}</span></button>`).join('')}
      </div>
      <p class="ob-p small">${getState().seeded ? "We'll add a few example quests to match. You can delete them any time." : 'Your current quests stay as they are.'}</p>
      ${getState().seeded ? `<button type="button" class="link" data-ob-profile="empty" style="${profile === 'empty' ? 'color:var(--ink);font-weight:700' : ''}">${profile === 'empty' ? '✓ ' : ''}Start with an empty list instead</button>` : ''}`;
    case 'target': {
      const t = s.target, some = Math.max(1, Math.min(t - 1, Math.round(t * 0.6)));
      return `
      <h1 class="ob-h">Your daily target</h1>
      <p class="ob-p">How many quests do you want to finish on a normal day? You can change this later.</p>
      <div class="ob-target">
        <button type="button" data-ob-step="-1" aria-label="Fewer">−</button><b aria-live="polite">${t}</b><button type="button" data-ob-step="1" aria-label="More">+</button>
      </div>
      <div class="chips" style="justify-content:center;margin:4px 0 16px">${[3, 5, 7, 10].map(n => `<button type="button" class="chip chip-btn${n === t ? ' on' : ''}" data-ob-target="${n}">${n} a day</button>`).join('')}</div>
      <div class="card" style="background:var(--coral)"><h3>Streak</h3><div class="small" style="color:var(--ink)">The number of days in a row you finish ${t} quest${t === 1 ? '' : 's'}. Miss a day and it starts again.</div></div>
      <div class="card" style="background:var(--butter)"><h3>EXP (points)</h3><div class="small" style="color:var(--ink)">${t > 1 ? `${some} of ${t} done = ${dayExp(some, t)} EXP · ` : ''}all ${t} done = ${dayExp(t, t)} EXP. Focus sessions add 1 EXP per 5 minutes.</div></div>`;
    }
    case 'yours': {
      const p = permission();
      const perm = { granted: '<span class="chip" style="background:var(--mint)">Allowed ✓</span>', denied: '<span class="small">Blocked in your browser settings</span>', unsupported: '<span class="small">Not available in this browser</span>' }[p]
        || '<button type="button" class="mini" data-ob-allow>Allow</button>';
      return `
      <h1 class="ob-h">Make it yours</h1>
      <div class="card">
        <div class="srow"><div class="l"><b>Reminders</b><small>Get a nudge when a quest is due, even with TaskFlow in the background.</small></div>${perm}</div>
        <div class="srow"><div class="l"><b>Sounds</b><small>A soft click when you tick a quest</small></div><button type="button" class="tog" role="switch" aria-checked="${s.sound}" data-ob-tog="sound" aria-label="Sounds"></button></div>
        <div class="srow"><div class="l"><b>Voice input</b><small>${speechSupported ? 'Say a quest instead of typing it' : 'Not available in this browser'}</small></div><button type="button" class="tog" role="switch" aria-checked="${s.voice && speechSupported}" data-ob-tog="voice" aria-label="Voice input" ${speechSupported ? '' : 'disabled'}></button></div>
      </div>
      <div class="card"><h3>Your calendar</h3><div class="small">Any quest with a date can go into Google Calendar or Apple Calendar from its page, or all at once from the Calendar tab.</div></div>`;
    }
    case 'done': {
      const n = s.name ? `, ${esc(s.name)}` : '';
      const inst = isInstalled() ? '' : `<div class="card"><h3>Install TaskFlow</h3><div class="small" style="margin-bottom:${canInstall() ? 10 : 0}px">Put it on your home screen or Start menu. It opens like an app and works offline.${canInstall() ? '' : ' Use your browser menu: "Install app", or Share → "Add to Home Screen" on iPhone.'}</div>${canInstall() ? '<button type="button" class="btn white sm" data-ob-install>Install app</button>' : ''}</div>`;
      return `
      <div class="ob-hero"><span class="ob-check" aria-hidden="true"></span></div>
      <h1 class="ob-h">You're all set${n}</h1>
      <p class="ob-p">Tap <b>+</b> to add a quest. Try typing <i>"Call mum tomorrow at 6pm"</i> and watch it pick up the date and time.</p>
      ${inst}`;
    }
  }
}

function frame() {
  const last = step === STEPS.length - 1;
  return `<div class="ob-top">
      <div class="ob-dots" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${step + 1}" aria-label="Step ${step + 1} of ${STEPS.length}">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'past' : ''}"></i>`).join('')}</div>
      ${last ? '' : '<button type="button" class="link" data-ob-skip>Skip</button>'}
    </div>
    <div class="ob-body"><div class="ob-step" data-step="${STEPS[step]}">${screen(STEPS[step])}</div></div>
    <div class="ob-nav">
      ${step > 0 && !last ? '<button type="button" class="btn ghost" data-ob-back>Back</button>' : ''}
      <button type="button" class="btn${last ? ' dark' : ''}" data-ob-next>${step === 0 ? 'Get started' : last ? 'Start using TaskFlow' : 'Next'}</button>
    </div>`;
}

// redraw; dir 1 / -1 slides the step sideways, 0 just refreshes it in place
function draw(dir = 0) {
  const old = root.querySelector('.ob-step');
  if (!dir || !old || reduced()) { root.innerHTML = frame(); focusFirst(); return; }
  old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-20 * dir}px)` }], { duration: 180, easing: EASE_IN, fill: 'forwards' })
    .finished.then(() => {
      root.innerHTML = frame();
      root.querySelector('.ob-step').animate([{ opacity: 0, transform: `translateX(${28 * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: 460, easing: EASE });
      root.querySelectorAll('.ob-step > *').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 40 + i * 45, easing: EASE, fill: 'backwards' }));
      focusFirst();
    });
}
function focusFirst() { const h = root.querySelector('.ob-step .ob-h'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }

function go(dir) {
  if (STEPS[step] === 'you' && dir > 0 && profile) applyStarter(profile);
  step = Math.max(0, Math.min(STEPS.length - 1, step + dir));
  play('click', 0.4);
  draw(dir);
}

export const isOpen = () => !!root && root.classList.contains('open');

export function close() {
  if (!root) return;
  finishOnboarding();
  root.classList.remove('open');
  document.body.classList.remove('ob-lock');
  const r = root;
  setTimeout(() => { r.hidden = true; }, reduced() ? 0 : 450);
}

export function open() {
  root = document.getElementById('onboard');
  step = 0; profile = getState().settings.profile || '';
  root.hidden = false;
  draw();
  document.body.classList.add('ob-lock');
  requestAnimationFrame(() => root.classList.add('open'));
  if (root.dataset.bound) return;
  root.dataset.bound = '1';
  root.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-ob-next]')) return step === STEPS.length - 1 ? close() : go(1);
    if (t.closest('[data-ob-back]')) return go(-1);
    if (t.closest('[data-ob-skip]')) return close();
    const pr = t.closest('[data-ob-profile]');
    if (pr) { profile = pr.dataset.obProfile; if (profile !== 'empty') setSetting('profile', profile, { quiet: true }); play('click', 0.4); return draw(); }
    const st = t.closest('[data-ob-step]');
    if (st) { setSetting('target', Math.max(1, Math.min(10, getState().settings.target + +st.dataset.obStep)), { quiet: true }); play('click', 0.4); return draw(); }
    const tg = t.closest('[data-ob-target]');
    if (tg) { setSetting('target', +tg.dataset.obTarget, { quiet: true }); play('click', 0.4); return draw(); }
    const tog = t.closest('[data-ob-tog]');
    if (tog) { const k = tog.dataset.obTog; setSetting(k, !getState().settings[k], { quiet: true }); return draw(); }
    if (t.closest('[data-ob-allow]')) { await requestPermission(); return draw(); }
    if (t.closest('[data-ob-install]')) { await install(); return draw(); }
  });
  root.addEventListener('input', e => { if (e.target.dataset.ob === 'name') setSetting('name', e.target.value.trim(), { quiet: true }); });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); go(1); }
    if (e.key === 'ArrowRight' && !e.target.matches('input')) go(1);
    if (e.key === 'ArrowLeft' && !e.target.matches('input') && step > 0) go(-1);
  });
}
export { supported, ICON };
