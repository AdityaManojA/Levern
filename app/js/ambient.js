// Procedural ambient audio loops for the Focus timer.
// Self-contained WebAudio: gentle rain, cafe background, and public domain classical piano.
// Zero external asset downloads, zero copyright issues, infinite seamless playback, offline capable.

let ctx = null;
let masterGain = null;
let currentSource = null;
let currentKind = 'none';
let volume = 0.5;
let enabled = false;

const BUFFERS = new Map();
const DEFAULT_DURATION = 4.0;

function getAudioContext() {
  if (!ctx) {
    const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
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

function createLoopBuffer(generator, duration = DEFAULT_DURATION) {
  const c = getAudioContext();
  if (!c) return null;
  const sr = c.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  generator(data, len, sr);

  // Crossfade the ends (80ms) to ensure 100% clickless loop
  const fade = Math.floor(sr * 0.08);
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] = data[i] * w + data[len - fade + i] * (1 - w);
    data[len - fade + i] = data[i];
  }
  return buf;
}

// 1. Gentle Rain: filtered pink noise with soft droplet impulses
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

// 2. Cafe: layered acoustic hum with warm resonance
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

// 3. Classical Piano: Erik Satie's Gymnopédie No. 1 (1888, public domain worldwide, zero copyright)
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function genClassical(data, len, sr) {
  const notes = [
    { t: 0.0, m: 43, dur: 5.8, gain: 0.35 },  // Bass G2
    { t: 0.8, m: 59, dur: 5.0, gain: 0.22 },  // Chord B3
    { t: 0.8, m: 62, dur: 5.0, gain: 0.22 },  // Chord D4
    { t: 0.8, m: 66, dur: 5.0, gain: 0.22 },  // Chord F#4 (Gmaj7)
    { t: 2.0, m: 71, dur: 3.5, gain: 0.28 },  // Melody B4
    { t: 3.8, m: 69, dur: 2.0, gain: 0.24 },  // Melody A4
    { t: 6.0, m: 38, dur: 5.8, gain: 0.35 },  // Bass D2
    { t: 6.8, m: 57, dur: 5.0, gain: 0.22 },  // Chord A3
    { t: 6.8, m: 61, dur: 5.0, gain: 0.22 },  // Chord C#4
    { t: 6.8, m: 66, dur: 5.0, gain: 0.22 },  // Chord F#4 (Dmaj7)
    { t: 8.0, m: 66, dur: 3.5, gain: 0.28 },  // Melody F#4
    { t: 9.8, m: 64, dur: 2.0, gain: 0.24 },  // Melody E4
  ];

  for (const n of notes) {
    const f = midiToFreq(n.m);
    const startIdx = Math.floor(n.t * sr);
    const noteLen = Math.floor(n.dur * sr);
    for (let i = 0; i < noteLen && (startIdx + i) < len; i++) {
      const t = i / sr;
      const attack = Math.min(1, t / 0.012);
      const decay = Math.exp(-t * 1.35);
      const env = attack * decay;
      const wave = Math.sin(2 * Math.PI * f * t) +
                   0.32 * Math.sin(4 * Math.PI * f * t) +
                   0.12 * Math.sin(6 * Math.PI * f * t) +
                   0.04 * Math.sin(8 * Math.PI * f * t);
      data[startIdx + i] += wave * env * n.gain * 0.45;
    }
  }
}

// 4. Backward compatibility helper
function genPurr(data, len, sr) {
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const purrMod = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 26 * t), 1.8);
    const tone = Math.sin(2 * Math.PI * 72 * t) * 0.5 + Math.sin(2 * Math.PI * 118 * t) * 0.3;
    const breath = (Math.random() * 2 - 1) * 0.08;
    data[i] = (tone * purrMod + breath * purrMod) * 0.9;
  }
}

export function playAmbient(kind = currentKind) {
  if (kind === 'whitenoise') kind = 'rain';
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
    if (kind === 'rain') BUFFERS.set('rain', createLoopBuffer(genRain, 4.0));
    else if (kind === 'cafe') BUFFERS.set('cafe', createLoopBuffer(genCafe, 4.0));
    else if (kind === 'classical') BUFFERS.set('classical', createLoopBuffer(genClassical, 12.0));
    else if (kind === 'purr') BUFFERS.set('purr', createLoopBuffer(genPurr, 4.0));
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
  if (kind === 'whitenoise') kind = 'rain';
  if (kind !== 'rain' && kind !== 'cafe' && kind !== 'classical' && kind !== 'purr') kind = 'none';
  currentKind = kind;
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
