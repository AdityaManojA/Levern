// Sound effects through Web Audio: every file is fetched and decoded up front (about 110 KB in all), so a
// sound starts the instant it's asked for. Rules (from the sound brief):
//  - nothing for blinks, breathing or eye movements; quiet, sparse paw steps only on purposeful walks
//  - 2–3 versions of anything that repeats, never the same one twice in a row, plus a slight pitch and
//    volume wobble so even those don't sound identical
//  - one "Sound effects" switch (off by default when the device asks for reduced motion) and the master volume;
//    Mochi's voice has its own switch too
//  - nothing plays until the first tap or key press (browsers block audio before that), and nothing queues up
import { getState } from './store.js';

const GROUPS = {
  tap: { files: ['tap-1', 'tap-2', 'tap-3'], vol: 0.35 },          // buttons, toggles, chips
  tab: { files: ['tab-1', 'tab-2'], vol: 0.45 },                   // switching screens from the nav bar
  tick: { files: ['tick-1', 'tick-2', 'tick-3'], vol: 0.7 },       // ticking a quest off
  coin: { files: ['coin'], vol: 0.55 },                            // daily target hit, focus session done, tour finished
  chime: { files: ['chime-1', 'chime-2'], vol: 0.5 },              // a reminder goes off
  // Mochi
  mrrp: { files: ['mrrp-1', 'mrrp-2', 'mrrp-3'], vol: 0.5, mochi: true },   // his signature chirp: affection
  sweet: { files: ['meow-sweet-1', 'meow-sweet-2'], vol: 0.4, mochi: true }, // hello / well done
  hey: { files: ['meow-hey-1', 'meow-hey-2'], vol: 0.38, mochi: true },     // "look!": reminders, surprises
  grumpy: { files: ['meow-grumpy-1', 'meow-grumpy-2'], vol: 0.35, mochi: true }, // annoyed, errors
  step: { files: ['step-1', 'step-2', 'step-3'], vol: 0.1, mochi: true },   // paw steps (purposeful walks only)
  land: { files: ['land'], vol: 0.28, mochi: true },                         // landing after you drop him
};
const OLD_NAMES = { click: 'tap', mew: 'mrrp' };

let ctx = null, master = null;
const buffers = new Map(), last = new Map(), lastAt = new Map();
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const defaultSoundOn = () => !reducedMotion();

function context() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: 'interactive' });
  master = ctx.createGain(); master.connect(ctx.destination);
  return ctx;
}

// fetch and decode everything once; decoding works while the context is still locked
export async function preloadSounds() {
  const c = context(); if (!c) return;
  const names = [...new Set(Object.values(GROUPS).flatMap(g => g.files))];
  await Promise.all(names.map(async n => {
    try {
      const data = await (await fetch(`sounds/${n}.mp3`)).arrayBuffer();
      buffers.set(n, await new Promise((res, rej) => c.decodeAudioData(data, res, rej)));
    } catch (e) { /* a missing sound is just silent */ }
  }));
}
// browsers only allow audio after a user gesture: resume on the first one
export function unlockOnGesture() {
  const unlock = () => { const c = context(); if (c && c.state !== 'running') c.resume().catch(() => {}); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, { capture: true, passive: true });
}
export const soundReady = () => !!ctx && ctx.state === 'running';

// sfx('tap') · sfx('mrrp', { vol: 0.8, rate: 1.1 })
export function sfx(name, { vol = 1, rate = 1 } = {}) {
  name = OLD_NAMES[name] || name;
  const g = GROUPS[name], s = getState()?.settings;
  if (!g || !s || s.sound === false || (g.mochi && s.mochiSound === false)) return;
  if (!ctx || ctx.state !== 'running') return;   // locked: skip rather than queue a burst for later
  const now = performance.now();
  if (now - (lastAt.get(name) || 0) < 55) return;   // the same sound stacked on itself sounds like a glitch
  lastAt.set(name, now);
  const pool = g.files.filter(f => buffers.has(f));
  if (!pool.length) return;
  const choices = pool.length > 1 ? pool.filter(f => f !== last.get(name)) : pool;
  const file = choices[Math.floor(Math.random() * choices.length)];
  last.set(name, file);
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = buffers.get(file);
  src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.06);            // ±3% pitch
  gain.gain.value = Math.min(1, g.vol * vol * (1 + (Math.random() - 0.5) * 0.16)); // ±8% loudness
  master.gain.value = Math.max(0, Math.min(1, s.volume ?? 0.6));
  src.connect(gain).connect(master);
  src.start();
  sfxLog.push({ name, file, at: Math.round(now) }); if (sfxLog.length > 60) sfxLog.shift();
}
// the last few sounds played (for debugging: TaskFlow.sfxLog in the console)
export const sfxLog = [];
export const soundsLoaded = () => buffers.size;
export const SOUND_GROUPS = GROUPS;
