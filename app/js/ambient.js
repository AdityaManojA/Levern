// Procedural ambient audio loops for the Focus timer.
// Self-contained WebAudio: purring cat, gentle rain, cafe background, and white noise.
// Zero external asset downloads, infinite seamless playback, offline capable.

let ctx = null;
let masterGain = null;
let currentSource = null;
let currentKind = 'none';
let volume = 0.5;
let enabled = false;

const BUFFERS = new Map();
const DURATION = 4.0; // 4 second seamless loops

function getAudioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(volume, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function createLoopBuffer(generator) {
  const c = getAudioContext();
  if (!c) return null;
  const sr = c.sampleRate;
  const len = Math.floor(sr * DURATION);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  generator(data, len, sr);

  // Crossfade the ends slightly (50ms) to ensure 100% clickless loop
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] = data[i] * w + data[len - fade + i] * (1 - w);
    data[len - fade + i] = data[i];
  }
  return buf;
}

// 1. Purr: deep rhythmic 26Hz modulation with warm ~75Hz/120Hz harmonics
function genPurr(data, len, sr) {
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const purrMod = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 26 * t), 1.8);
    const tone = Math.sin(2 * Math.PI * 72 * t) * 0.5 + Math.sin(2 * Math.PI * 118 * t) * 0.3;
    const breath = (Math.random() * 2 - 1) * 0.08;
    data[i] = (tone * purrMod + breath * purrMod) * 0.9;
  }
}

// 2. Gentle Rain: filtered pink noise with soft droplet impulses
function genRain(data, len, sr) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;

    // Random soft droplets
    const drop = Math.random() < 0.0008 ? (Math.random() * 2 - 1) * 0.3 : 0;
    data[i] = (pink * 0.08 + drop) * 0.7;
  }
}

// 3. Cafe: layered acoustic hum with warm resonance
function genCafe(data, len, sr) {
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const white = Math.random() * 2 - 1;
    b0 = 0.99 * b0 + white * 0.05;
    b1 = 0.95 * b1 + white * 0.1;
    b2 = 0.85 * b2 + white * 0.2;
    const murmurMod = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.4 * t);
    const cupClink = Math.random() < 0.00015 ? Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-(i % 1000) / 100) * 0.15 : 0;
    data[i] = ((b0 + b1 + b2) * 0.25 * murmurMod + cupClink) * 0.6;
  }
}

// 4. White Noise: gentle fatigue-free broadband noise
function genWhiteNoise(data, len, sr) {
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // Gentle 1-pole lowpass to tame high frequencies
    last = last * 0.65 + white * 0.35;
    data[i] = last * 0.35;
  }
}

export function playAmbient(kind = currentKind) {
  if (!kind || kind === 'none') {
    stopAmbient();
    return;
  }
  const c = getAudioContext();
  if (!c) return;

  if (currentSource) {
    try { currentSource.stop(); currentSource.disconnect(); } catch (e) {}
    currentSource = null;
  }

  if (!BUFFERS.has(kind)) {
    if (kind === 'purr') BUFFERS.set('purr', createLoopBuffer(genPurr));
    else if (kind === 'rain') BUFFERS.set('rain', createLoopBuffer(genRain));
    else if (kind === 'cafe') BUFFERS.set('cafe', createLoopBuffer(genCafe));
    else if (kind === 'whitenoise') BUFFERS.set('whitenoise', createLoopBuffer(genWhiteNoise));
  }

  const buf = BUFFERS.get(kind);
  if (!buf) return;

  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(masterGain);
  src.start();

  currentSource = src;
  currentKind = kind;
  enabled = true;
}

export function stopAmbient() {
  if (currentSource) {
    try { currentSource.stop(); currentSource.disconnect(); } catch (e) {}
    currentSource = null;
  }
  enabled = false;
}

export function setAmbientKind(kind) {
  currentKind = kind || 'none';
  if (enabled && currentKind !== 'none') {
    playAmbient(currentKind);
  } else if (currentKind === 'none') {
    stopAmbient();
  }
}

export function setAmbientVolume(vol) {
  volume = Math.max(0, Math.min(1, vol));
  if (masterGain && ctx) {
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
  }
}

export function getAmbientKind() {
  return currentKind;
}

export function isAmbientActive() {
  return enabled && !!currentSource;
}
