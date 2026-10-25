// First-run onboarding, matching the Figma "Onboarding" page (file bnt8lsuv1xdCg4xHFitxvZ, node 6:2):
// Welcome · What's a quest? · How will you use TaskFlow? · How many quests a day? · Make it yours · Tour prompt.
// Shown once (state.onboarded); Settings → You → Welcome screens reopens it.
// Copy rule from the design brief: every game word gets a plain meaning the first time it appears.
import { getState, setSetting, finishOnboarding, TIER_COLORS } from '../store.js';
import { dayExp } from '../stats.js';
import { speechSupported } from '../speech.js';
import { esc, play, toast, download, confirmBox } from '../ui.js';
import { EASE, EASE_IN, reduced } from '../motion.js';
import { portrait, sprite } from '../mochi.js';
import * as cal from '../calendars.js';
import * as account from '../account.js';
import { buildICS } from '../ics.js';
import * as cloud from '../cloud.js';
import * as nudges from '../nudges.js';
import { slog, serr } from '../signinlog.js';
import { notifyCard } from '../notifyhelp.js';

// Set up on this device: kept apart from the account and survives sign-out, so signing back in
// doesn't walk someone through the welcome steps again.
const DEVICE_KEY = 'taskflow-device-setup';
export const deviceSetupDone = () => { try { return localStorage.getItem(DEVICE_KEY) === '1' || !!getState().onboarded; } catch (e) { return !!getState().onboarded; } };
const markDeviceSetup = () => { try { localStorage.setItem(DEVICE_KEY, '1'); } catch (e) {} };
// the one question a returning, signed-in person gets instead of the steps
export const welcomeBack = startTour => confirmBox('Welcome back. Want the quick tour?', 'Show tour').then(yes => { if (yes && startTour) startTour(); });
document.addEventListener('nudges:change', () => { if (isOpen() && STEPS[step] === 'remind') refresh(); });

const STEPS = ['welcome', 'account', 'quests', 'use', 'target', 'remind', 'notify', 'yours', 'tour'];
const G_LOGO = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
let step = 0, root = null, profile = '', stops = [], onFinish = null, linked = {}, busy = false, returning = false;

const USES = [
  ['student', 'Student', 'Classes, a timetable and exam prep', 'var(--sky)'],
  ['work', 'Work', 'Projects, meetings and deadlines', 'var(--butter)'],
  ['personal', 'Personal', 'Habits, chores and goals', 'var(--mint)'],
];

function screen(name) {
  const s = getState().settings;
  switch (name) {
    case 'welcome': return `
      <div class="ob-center">
        <div class="ob-circle ob-circle-sm" style="background:var(--lav)"><span class="ob-mochi" data-anim="happy-wiggle" data-scale="1.3" data-pause="1400"></span></div>
        <h1 class="ob-h" style="text-align:center">Welcome to TaskFlow</h1>
        <p class="ob-p muted" style="text-align:center">A calm to-do list that feels like a game. Finish tasks, build a streak, earn points, and keep Mochi company.</p>
      </div>`;
    case 'account': {
      const u = account.user();
      return `
      <h1 class="ob-h">Sign in</h1>
      <p class="ob-p muted">Sign in with Google to keep your quests safe and the same on all your devices, and to connect Google Calendar.</p>
      ${u ? `<div class="ob-row ob-me">${u.photo ? `<img src="${esc(u.photo)}" alt="" width="40" height="40" referrerpolicy="no-referrer">` : ''}<span><b>${esc(u.name || 'Signed in')}</b><small>${esc(u.email)}</small></span><button type="button" class="link" data-ob-signout>Sign out</button></div>`
        : `<button type="button" class="ob-google" data-ob-google${busy ? ' disabled' : ''}>${G_LOGO}<span>${busy ? 'Signing in…' : 'Continue with Google'}</span></button>`}
      <p class="ob-p muted small" style="margin-top:14px">Already use TaskFlow? Sign in with the same Google account and your quests come back.</p>
      <p class="ob-p muted small">See what we keep in the <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a> and <a href="cookies.html" target="_blank" rel="noopener">cookies</a> pages.</p>`;
    }
    case 'quests': return `
      <h1 class="ob-h">What's a quest?</h1>
      <p class="ob-p muted">A quest is simply a task, anything you want to get done. We call them quests because finishing them earns you points.</p>
      <div class="ob-label">For example</div>
      ${[['Submit lab report', 0, 'P1 · Critical · due today'], ['Read 10 pages', 2, 'P3 · Medium · every day'], ['Call grandma', 3, 'P4 · Normal · this week']].map(([t, p, m]) => `
        <div class="ob-q" style="--c:${TIER_COLORS[p]}"><span class="chk" aria-hidden="true"></span><span><b>${t}</b><small>${m}</small></span></div>`).join('')}
      <div class="ob-card">
        <b>Questline = a bigger goal</b>
        <p>A group of quests that belong together. "Exam week" could be 5 quests: revise, flashcards, a past paper…</p>
        <div class="bar" style="background:var(--card)"><i style="width:40%;background:var(--butter)"></i></div>
      </div>
      <div class="ob-chips">${TIER_COLORS.map((c, i) => `<span style="--c:${c}">P${i + 1}</span>`).join('')}</div>
      <p class="ob-p muted small">The colour shows priority: P1 (red) is most urgent, P6 (lilac) is "someday".</p>`;
    case 'use': {
      return `
      <h1 class="ob-h">How will you use TaskFlow?</h1>
      <p class="ob-p muted">Pick one. You can change it later.</p>
      <div class="ob-uses" role="radiogroup" aria-label="How will you use TaskFlow?">
        ${USES.map(([k, l, d, c]) => `<button type="button" role="radio" aria-checked="${profile === k}" class="ob-use${profile === k ? ' on' : ''}" style="--c:${c}" data-ob-profile="${k}">
          <span class="radio" aria-hidden="true"></span><span><b>${l}</b><small>${d}</small></span></button>`).join('')}
      </div>`;
    }
    case 'target': {
      const t = s.target, some = Math.max(1, Math.min(t - 1, Math.round(t * 0.6)));
      return `
      <h1 class="ob-h">How many quests a day?</h1>
      <p class="ob-p muted">Pick how many tasks you want to finish each day, like "Reply to Sam", "Gym" or "Read 10 pages".</p>
      <div class="ob-stepper">
        <button type="button" class="minus" data-ob-step="-1" aria-label="Fewer">−</button>
        <div><b aria-live="polite">${t}</b><small>quests a day</small></div>
        <button type="button" class="plus" data-ob-step="1" aria-label="More">+</button>
      </div>
      <div class="ob-presets">${[3, 5, 7, 10].map(n => `<button type="button" class="${n === t ? 'on' : ''}" data-ob-target="${n}">${n}</button>`).join('')}</div>
      <div class="ob-card" style="background:var(--mint)"><b>Your streak</b><p>Finish ${t} today and your streak grows by 1 day. Miss a day and it starts again from 0.</p></div>
      <div class="ob-card" style="background:var(--butter)"><b>EXP = points</b><p>You earn EXP for each quest you finish.<br>${t > 1 ? `${some} of ${t} done = ${dayExp(some, t)} EXP · ` : ''}all ${t} done = ${dayExp(t, t)} EXP (includes a +10 bonus).</p></div>`;
    }
    case 'remind': return `
      <h1 class="ob-h">When should I remind you?</h1>
      <p class="ob-p muted">Pick a time for a look at today's quests, and turn on any nudges you'd like. Add as many times a day as you want. You can change all of this later in Settings.</p>
      <div class="ob-card nudges" style="background:var(--card)">${nudges.editor()}</div>`;
    case 'notify': return `
      <h1 class="ob-h">Turn on notifications</h1>
      <p class="ob-p muted">So reminders reach you on time, even when TaskFlow is in the background. Here's how on the device you're using.</p>
      ${notifyCard()}`;
    case 'yours': {
      const g = cal.googleState();
      const pill = (key, label, on) => `<button type="button" class="ob-pill${on ? ' done' : ''}" data-ob-connect="${key}">${esc(label)}</button>`;
      return `
      <h1 class="ob-h">Make it yours</h1>
      <p class="ob-p muted">Connect a calendar and choose how TaskFlow feels. Everything here can be changed later in Settings.</p>
      <div class="ob-row"><span><b>Google Calendar</b><small>Quests with a due date show up here</small></span>${pill('google', g.connected ? 'Connected' : 'Connect', g.connected)}</div>
      <div class="ob-row"><span><b>Apple Calendar</b><small>${cal.feedAvailable() === false ? 'Get a calendar file of your dated quests to open in Apple Calendar' : 'Quests with a due date show up here'}</small></span>${pill('apple', linked.apple ? 'Added' : cal.feedAvailable() === false ? 'Get file' : 'Connect', linked.apple)}</div>
      <div class="ob-row"><span><b>Apple Reminders</b><small>Coming with the TaskFlow phone app</small></span><button type="button" class="ob-pill soon" data-ob-connect="reminders">Soon</button></div>
      <div class="ob-label" style="margin-top:16px">Feel</div>
      <div class="ob-row"><span><b>Satisfying sounds</b><small>A soft key click when you tick a quest, a coin when you hit your target</small></span><button type="button" class="tog" role="switch" aria-checked="${s.sound}" data-ob-tog="sound" aria-label="Satisfying sounds"></button></div>
      <div class="ob-row"><span><b>Voice input</b><small>${speechSupported ? 'Say a task out loud instead of typing it' : 'Not available in this browser'}</small></span><button type="button" class="tog" role="switch" aria-checked="${!!s.voice && speechSupported}" data-ob-tog="voice" aria-label="Voice input" ${speechSupported ? '' : 'disabled'}></button></div>`;
    }
    case 'tour': return `
      <div class="ob-center">
        <div class="ob-speech"><b>Hi, I'm Mochi!</b><p>Want a quick tour? It takes about 30 seconds. I'll show you where your quests live and how to make the app yours.</p></div>
        <div class="ob-circle ob-circle-sm" style="background:var(--sky)"><span class="ob-mochi" data-anim="wave" data-scale="1.2"></span></div>
      </div>`;
  }
}

function footer() {
  const dots = `<div class="ob-dots" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${step + 1}" aria-label="Step ${step + 1} of ${STEPS.length}">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
  const name = STEPS[step];
  if (name === 'tour') return `${dots}<button type="button" class="btn block" data-ob-tour>Show me around</button><button type="button" class="btn white block" data-ob-skiptour style="margin-top:12px">Skip tour</button>`;
  const label = { welcome: 'Get started', quests: 'Got it' }[name] || 'Continue';
  const below = name === 'welcome' ? '<button type="button" class="link ob-under" data-ob-skip>I\'ve used TaskFlow before</button>'
    : name === 'yours' || name === 'notify' ? '<button type="button" class="link ob-under" data-ob-next>Skip for now</button>' : '';
  // sign-in is required: no way past this step until it's done
  if (name === 'account' && !account.user()) return `${dots}<button type="button" class="btn block" disabled aria-describedby="ob-need">Continue</button><p class="small ob-under" id="ob-need" style="text-align:center">Sign in with Google to continue</p>`;
  const perch = name === 'quests' ? '<span class="ob-perch" data-anim="rest" data-scale=".62" aria-hidden="true"></span>' : '';
  return `${dots}<div style="position:relative">${perch}<button type="button" class="btn block" data-ob-next>${label}</button></div>${below}`;
}

const frame = () => `<div class="ob-body"><div class="ob-step" data-step="${STEPS[step]}">${screen(STEPS[step])}</div></div><div class="ob-foot">${footer()}</div>`;

function mountSprites() {
  stops.forEach(s => s()); stops = [];
  root.querySelectorAll('[data-portrait]').forEach(el => stops.push(portrait(el, +el.dataset.portrait)));
  root.querySelectorAll('[data-anim]').forEach(el => stops.push(sprite(el, el.dataset.anim, { scale: +el.dataset.scale || 1, pause: +el.dataset.pause || (el.dataset.anim === 'wave' ? 1600 : 0) })));
}
function draw(dir = 0) {
  const old = root.querySelector('.ob-step');
  const paint = () => { root.innerHTML = frame(); mountSprites(); const h = root.querySelector('.ob-h'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } root.scrollTop = 0; };
  if (!dir || !old || reduced()) { paint(); return; }
  old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-20 * dir}px)` }], { duration: 180, easing: EASE_IN, fill: 'forwards' }).finished.then(() => {
    paint();
    root.querySelector('.ob-step').animate([{ opacity: 0, transform: `translateX(${28 * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: 460, easing: EASE });
    root.querySelectorAll('.ob-step > *, .ob-center > *').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 40 + i * 45, easing: EASE, fill: 'backwards' }));
  });
}
// re-render the current step without the slide (after a choice)
const refresh = () => { const y = root.scrollTop; root.innerHTML = frame(); mountSprites(); root.scrollTop = y; };

function go(dir) {
  if (STEPS[step] === 'account' && dir > 0 && !account.user()) return;
  step = Math.max(0, Math.min(STEPS.length - 1, step + dir));
  play('click', 0.4);
  draw(dir);
}

export const isOpen = () => !!root && root.classList.contains('open');

export function close(then) {
  if (!root) return;
  finishOnboarding();
  markDeviceSetup();
  root.classList.remove('open');
  document.body.classList.remove('ob-lock');
  const r = root;
  setTimeout(() => { r.hidden = true; stops.forEach(s => s()); stops = []; if (then) then(); }, reduced() ? 0 : 450);
}

// startTour: called when "Show me around" is chosen
// startAt: a step to begin on (the sign-in step for someone who has used TaskFlow on this device before)
export function open(startTour, { startAt = null } = {}) {
  if (startTour) onFinish = startTour;
  root = document.getElementById('onboard');
  step = startAt ? Math.max(0, STEPS.indexOf(startAt)) : 0;
  profile = getState().settings.profile || ''; linked = {}; returning = !!startAt;
  root.hidden = false;
  draw();
  document.body.classList.add('ob-lock');
  requestAnimationFrame(() => root.classList.add('open'));
  if (root.dataset.bound) return;
  root.dataset.bound = '1';
  root.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-ob-next]')) return go(1);
    // "I've used TaskFlow before": sign in, then straight into the app
    if (t.closest('[data-ob-skip]')) { if (account.user()) return close(); returning = true; step = STEPS.indexOf('account') - 1; return go(1); }
    if (t.closest('[data-ob-skiptour]')) return close();
    if (t.closest('[data-ob-tour]')) return close(() => onFinish && onFinish());
    const pr = t.closest('[data-ob-profile]');
    if (pr) { profile = pr.dataset.obProfile; setSetting('profile', profile, { quiet: true }); play('click', 0.4); return refresh(); }
    const st = t.closest('[data-ob-step]');
    if (st) { setSetting('target', Math.max(1, Math.min(10, getState().settings.target + +st.dataset.obStep)), { quiet: true }); play('click', 0.4); return refresh(); }
    const tg = t.closest('[data-ob-target]');
    if (tg) { setSetting('target', +tg.dataset.obTarget, { quiet: true }); play('click', 0.4); return refresh(); }
    const tog = t.closest('[data-ob-tog]');
    if (tog) { const k = tog.dataset.obTog, on = !getState().settings[k]; tog.setAttribute('aria-checked', on); setSetting(k, on, { quiet: true }); play('click', 0.4); return; }
    const c = t.closest('[data-ob-connect]');
    if (c) return connect(c.dataset.obConnect);
    if (t.closest('[data-ob-google]')) { slog('Continue with Google tapped', { busy }); return googleSignIn(); }
    if (t.closest('[data-ob-signout]')) { await cloud.signOutAndReset({ force: true }); return refresh(); }
  });
  root.addEventListener('keydown', e => {
    if (e.target.matches('input')) return;
    if (e.key === 'ArrowRight' && STEPS[step] !== 'tour') go(1);
    if (e.key === 'ArrowLeft' && step > 0) go(-1);
  });
  // swipe from left to right = back one step. A touch that starts near either screen edge belongs to the
  // phone's own back gesture (iPhone and Android), so it's ignored. Sliders, pickers and text fields are left alone.
  const EDGE = 40, MIN_DX = 90, MAX_MS = 800;
  let swipe = null;
  root.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const edge = t.clientX < EDGE || t.clientX > innerWidth - EDGE;
    const control = e.target.closest('input, textarea, select, [data-tw], .tw-panel, [data-ropts], [data-alerts]');
    swipe = edge || control || e.touches.length > 1 ? null : { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  root.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, dt = Date.now() - swipe.t;
    swipe = null;
    // clearly sideways only: scrolling up or down never moves the steps
    if (dx > MIN_DX && Math.abs(dy) < Math.abs(dx) * 0.5 && dt < MAX_MS && step > 0) go(-1);
  }, { passive: true });
}

async function googleSignIn() {
  busy = true; refresh();
  slog('sign-in button: starting');
  // if Google never opens (blocked, or the page never moves on), don't leave the button on "Signing in…" for ever
  const stuck = setTimeout(() => {
    if (!busy) return;
    serr('sign-in button', { code: 'timeout', message: 'Google did not open within 20 s' });
    busy = false; if (isOpen()) refresh();
    toast("Google didn't open. Check your connection, then tap Continue with Google again.");
  }, 20000);
  try { const u = await account.signIn(); slog('sign-in returned', { gotUser: !!u }); if (u) return afterSignIn(u); }
  catch (e) { serr('sign-in button', e); toast(e.message); }
  finally { clearTimeout(stuck); }
  busy = false;
  if (isOpen()) refresh();
}
// bring in the account's quests; someone who already has them skips the rest of the setup
async function afterSignIn(u) {
  const first = account.greetName(u.name);
  play('click', 0.4);
  const r = await cloud.syncNow();
  const had = getState().settings.name;
  // fill the name in, or replace one that isn't really a name (an earlier sign-in saved "Free" from "Free Fire")
  if (first && (!had || !account.greetName(had))) setSetting('name', first, { quiet: true });
  busy = false;
  const back = deviceSetupDone();
  // a returning account goes straight into the app, on any device: no welcome steps again
  if (back || r.hadData || r.known || returning) {
    toast(`Welcome back${first ? `, ${first}` : ''}`, 'good');
    const tour = onFinish; close();
    if (back) setTimeout(() => welcomeBack(tour), 600);
    return;
  }
  toast(`Signed in${first ? ` as ${first}` : ''}`, 'good');
  if (isOpen()) go(1);
}
// Back from a full-page Google sign-in (phones that block the popup): carry on from the sign-in step
// instead of starting the welcome screens again.
export async function resumeSignIn(startTour) {
  open(startTour);
  step = STEPS.indexOf('account'); busy = true; draw();
  const u = await account.finishRedirect();
  if (u) return afterSignIn(u);
  busy = false; refresh();
  toast('Google sign-in didn\'t finish. Please try again.');
}

async function connect(kind) {
  if (kind === 'google') {
    if (!cal.googleConfigured()) return toast('Sign in with Google first (go back one step), then connect your calendar.');
    try { await cal.connectGoogle(); toast('Google Calendar connected', 'good'); } catch (e) { toast(e.message); }
    return refresh();
  }
  if (kind === 'apple') {
    // no live link without a server: hand over a calendar file instead
    if (!cal.feedAvailable()) { download('taskflow.ics', buildICS(getState().quests), 'text/calendar'); linked.apple = true; toast('Calendar file saved. Open it to add your quests to Apple Calendar.'); return refresh(); }
    linked.apple = true; location.href = cal.webcalUrl(); return refresh();
  }
  toast('Apple Reminders will come with the TaskFlow phone app.');
}
