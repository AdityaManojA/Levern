// Long-form procedural classical audio and nature ambiances for the Focus timer.
// Self-contained WebAudio: 7 legendary classical masterpieces (100% public domain worldwide),
// plus gentle rain, forest vibes, and soft white noise.
// Zero external asset downloads, zero copyright issues, commercial use 100% free, offline capable.
// Continuous gapless looping with measure-aligned durations and seamless 3-second crossfading.

let ctx = null;
let masterGain = null;
let currentSource = null;
let currentKind = 'none';
let volume = 0.5;
let enabled = false;

const BUFFERS = new Map();

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

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function renderPianoNote(data, len, sr, startSec, midi, durSec, gain = 0.3) {
  const f = midiToFreq(midi);
  const startIdx = Math.floor(startSec * sr);
  const noteLen = Math.floor(durSec * sr);
  for (let i = 0; i < noteLen && (startIdx + i) < len; i++) {
    const t = i / sr;
    const attack = Math.min(1, t / 0.015);
    const decay = Math.exp(-t * 1.15);
    const env = attack * decay;
    const wave = Math.sin(2 * Math.PI * f * t) +
                 0.32 * Math.sin(4 * Math.PI * f * t) +
                 0.12 * Math.sin(6 * Math.PI * f * t) +
                 0.04 * Math.sin(8 * Math.PI * f * t);
    data[startIdx + i] += wave * env * gain * 0.35;
  }
}

function createLoopBuffer(generator, durationSec) {
  const c = getAudioContext();
  if (!c) return null;
  const sr = 22050; // Optimized sample rate for rich piano overtones and fast generation
  const len = Math.floor(sr * durationSec);
  const fade = Math.floor(sr * 3.0); // 3-second seamless loop crossfade
  const totalGenLen = len + fade;

  // Render into temporary buffer containing durationSec + fade
  const temp = new Float32Array(totalGenLen);
  generator(temp, totalGenLen, sr);

  // Allocate exact duration buffer for gapless looping
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  // Seamlessly crossfade the end overflow into the start
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] = temp[i] * w + temp[len + i] * (1 - w);
  }
  // Copy the rest directly
  for (let i = fade; i < len; i++) {
    data[i] = temp[i];
  }
  return buf;
}

// 1. Erik Satie: Gymnopédie No. 1 (1888, 191.4s / 3:11, Lent et douloureux)
function genSatie(data, len, sr) {
  const beat = 1.45; // Slow 3/4 quarter note
  let t = 0.0;
  const bars = [
    { bass: 43, chord: [59, 62, 66], mel: null },
    { bass: 38, chord: [57, 61, 66], mel: null },
    { bass: 43, chord: [59, 62, 66], mel: null },
    { bass: 38, chord: [57, 61, 66], mel: null },
    { bass: 43, chord: [59, 62, 66], mel: 71 }, // B4
    { bass: 38, chord: [57, 61, 66], mel: 69 }, // A4
    { bass: 43, chord: [59, 62, 66], mel: 67 }, // G4
    { bass: 38, chord: [57, 61, 66], mel: 66 }, // F#4
    { bass: 40, chord: [55, 59, 64], mel: 64 }, // E4
    { bass: 38, chord: [57, 62, 66], mel: 62 }, // D4
    { bass: 43, chord: [59, 62, 67], mel: 67 }, // G4
    { bass: 38, chord: [57, 61, 66], mel: 66 }, // F#4
    { bass: 45, chord: [57, 60, 65], mel: 69 }, // A4
    { bass: 40, chord: [55, 59, 64], mel: 67 }, // G4
    { bass: 36, chord: [55, 60, 64], mel: 64 }, // E4
    { bass: 38, chord: [57, 62, 66], mel: 62 }, // D4
    { bass: 43, chord: [59, 62, 66], mel: 71 }, // B4
    { bass: 38, chord: [57, 61, 66], mel: 69 }, // A4
    { bass: 43, chord: [59, 62, 66], mel: 67 }, // G4
    { bass: 38, chord: [57, 61, 66], mel: 66 }, // F#4
    { bass: 40, chord: [55, 59, 64], mel: 64 }, // E4
    { bass: 38, chord: [57, 61, 66], mel: 62 }, // D4
  ];
  // 2 full cycles of 22 bars = 44 bars = 191.4s
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const b of bars) {
      renderPianoNote(data, len, sr, t, b.bass, beat * 2.8, 0.36);
      for (const m of b.chord) {
        renderPianoNote(data, len, sr, t + beat * 0.9, m, beat * 2.0, 0.20);
      }
      if (b.mel) {
        renderPianoNote(data, len, sr, t + beat * 0.9, b.mel, beat * 2.2, 0.28);
      }
      t += beat * 3.0;
    }
  }
}

// 2. Claude Debussy: Clair de lune (1890/1905, 197.6s / 3:17, Andante très expressif)
function genDebussy(data, len, sr) {
  const tempo = 0.95; // 9/8 eighth note
  let t = 0.0;
  const phraseA = [
    { bass: 49, chords: [65, 68], mel: 77, d: 3 },
    { bass: null, chords: [63, 66], mel: 75, d: 3 },
    { bass: 49, chords: [61, 65], mel: 73, d: 6 },
    { bass: 44, chords: [60, 63], mel: 72, d: 3 },
    { bass: 42, chords: [58, 61], mel: 70, d: 3 },
    { bass: 44, chords: [56, 60], mel: 68, d: 6 },
    { bass: 41, chords: [53, 56], mel: 65, d: 4 },
    { bass: 49, chords: [61, 65, 68], mel: 73, d: 6 },
  ];
  const phraseB = [
    { bass: 42, chords: [54, 58, 61], mel: 70, d: 3 },
    { bass: 44, chords: [56, 60, 63], mel: 72, d: 3 },
    { bass: 46, chords: [58, 61, 65], mel: 73, d: 3 },
    { bass: 44, chords: [56, 60, 65], mel: 75, d: 3 },
    { bass: 49, chords: [61, 65, 68], mel: 77, d: 6 },
  ];
  const allPhrases = [...phraseA, ...phraseB];
  // 4 full cycles = 4 * 49.4s = 197.6s
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const p of allPhrases) {
      if (p.bass) renderPianoNote(data, len, sr, t, p.bass, tempo * p.d * 1.5, 0.32);
      for (const c of p.chords) {
        renderPianoNote(data, len, sr, t + tempo * 0.4, c, tempo * p.d * 1.1, 0.18);
      }
      if (p.mel) {
        renderPianoNote(data, len, sr, t + tempo * 0.2, p.mel, tempo * p.d * 1.3, 0.28);
      }
      t += tempo * p.d;
    }
  }
}

// 3. Johann Sebastian Bach: Prelude in C Major, BWV 846 (1722, 196.0s / 3:16)
function genBach(data, len, sr) {
  const score = [
    [60, 64, 67, 72, 76], [60, 62, 69, 74, 77], [59, 62, 67, 74, 77], [60, 64, 67, 72, 76],
    [60, 64, 69, 72, 77], [60, 62, 69, 74, 78], [59, 62, 67, 74, 79], [60, 64, 67, 72, 76],
    [57, 64, 69, 72, 76], [54, 62, 66, 69, 74], [55, 62, 67, 71, 74], [56, 62, 65, 68, 74],
    [57, 60, 65, 69, 72], [54, 60, 63, 66, 72], [55, 59, 62, 67, 71], [60, 64, 67, 70, 76],
    [60, 65, 69, 72, 77], [58, 62, 65, 69, 74], [55, 62, 65, 67, 74], [60, 64, 67, 72, 76],
    [61, 64, 67, 70, 76], [62, 65, 69, 74, 77], [58, 62, 65, 70, 74], [60, 64, 67, 72, 76],
    [53, 65, 69, 72, 77], [54, 63, 66, 69, 75], [55, 62, 67, 71, 74], [56, 62, 65, 68, 74],
    [55, 62, 67, 71, 74], [55, 62, 65, 67, 74], [55, 60, 64, 67, 72], [55, 62, 65, 67, 74],
    [48, 60, 64, 67, 72], [48, 59, 65, 67, 74], [48, 60, 64, 67, 72]
  ];
  let curTime = 0.0;
  const step = 0.175;
  // 2 full cycles of 35 measures = 70 measures = 196.0s
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const chord of score) {
      for (let rep = 0; rep < 2; rep++) {
        const arp = [chord[0], chord[1], chord[2], chord[3], chord[4], chord[2], chord[3], chord[4]];
        for (const m of arp) {
          renderPianoNote(data, len, sr, curTime, m, 1.1, 0.24);
          curTime += step;
        }
      }
    }
  }
}

// 4. Ludwig van Beethoven: Moonlight Sonata, Op. 27 No. 2 (1801, 216.0s / 3:36, Adagio sostenuto)
function genBeethoven(data, len, sr) {
  const triplet = 0.40; // 0.40s per triplet note, 1 beat = 1.20s, 1 bar = 4.80s
  let t = 0.0;
  const measures = [
    { bass: [37, 49], arp: [56, 61, 64], mel: null },
    { bass: [35, 47], arp: [56, 61, 64], mel: null },
    { bass: [33, 45], arp: [54, 57, 61], mel: null },
    { bass: [32, 44], arp: [56, 59, 63], mel: null },
    { bass: [37, 49], arp: [56, 61, 64], mel: 68 },
    { bass: [37, 49], arp: [56, 61, 64], mel: 68 },
    { bass: [37, 49], arp: [56, 61, 64], mel: 68 },
    { bass: [37, 49], arp: [56, 61, 64], mel: 69 },
    { bass: [32, 44], arp: [56, 59, 63], mel: 68 },
    { bass: [32, 44], arp: [56, 59, 62], mel: 67 },
    { bass: [37, 49], arp: [56, 61, 64], mel: 68 },
    { bass: [40, 52], arp: [59, 64, 67], mel: 71 },
    { bass: [40, 52], arp: [59, 64, 67], mel: 71 },
    { bass: [35, 47], arp: [59, 62, 66], mel: 69 },
    { bass: [37, 49], arp: [56, 61, 64], mel: 68 },
  ];
  // 3 full cycles of 15 measures = 45 measures = 216.0s
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const m of measures) {
      for (const b of m.bass) {
        renderPianoNote(data, len, sr, t, b, triplet * 9.0, 0.35);
      }
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          const noteTime = t + (i * 3 + j) * triplet;
          renderPianoNote(data, len, sr, noteTime, m.arp[j], triplet * 2.2, 0.16);
        }
      }
      if (m.mel) {
        renderPianoNote(data, len, sr, t + triplet * 3.0, m.mel, triplet * 6.0, 0.30);
      }
      t += triplet * 12.0;
    }
  }
}

// 5. Frédéric Chopin: Nocturne in E-flat Major, Op. 9 No. 2 (1832, 192.0s / 3:12, Andante)
function genChopin(data, len, sr) {
  const beat = 1.50; // 4 beats per measure in 12/8 time = 6.0s
  let t = 0.0;
  const measures = [
    { bass: 39, chords: [51, 55, 58], mel: [70, 71, 70, 67] },
    { bass: 36, chords: [48, 55, 60], mel: [65, 63, 62, 63] },
    { bass: 41, chords: [53, 56, 60], mel: [65, 70, 68, 67] },
    { bass: 46, chords: [50, 53, 56], mel: [65, 63, 62, 60] },
    { bass: 39, chords: [51, 55, 58], mel: [70, 72, 75, 74] },
    { bass: 44, chords: [56, 60, 63], mel: [72, 70, 68, 67] },
    { bass: 41, chords: [53, 58, 62], mel: [65, 67, 65, 62] },
    { bass: 39, chords: [51, 55, 58], mel: [63, null, null, null] },
  ];
  // 4 full cycles of 8 measures = 32 measures = 192.0s
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const m of measures) {
      renderPianoNote(data, len, sr, t, m.bass, beat * 3.5, 0.36);
      for (let p = 1; p <= 3; p++) {
        for (const c of m.chords) {
          renderPianoNote(data, len, sr, t + p * beat * 0.9, c, beat * 1.5, 0.16);
        }
      }
      for (let i = 0; i < m.mel.length; i++) {
        const note = m.mel[i];
        if (note) {
          renderPianoNote(data, len, sr, t + i * beat, note, beat * 1.8, 0.30);
        }
      }
      t += beat * 4.0;
    }
  }
}

// 6. Wolfgang Amadeus Mozart: Piano Sonata No. 16 in C Major, K. 545 - Andante (1788, 180.0s / 3:00)
function genMozart(data, len, sr) {
  const beat = 0.75; // 3/4 time, 1 bar = 2.25s
  const barLen = beat * 3.0;
  let t = 0.0;
  const theme = [
    // Bars 1-4: Serene opening theme with gentle Alberti bass
    { bass: 43, arp: [55, 59, 55, 59], mel: [{ m: 79, d: 2 }, { m: 83, d: 1 }] },
    { bass: 45, arp: [54, 57, 54, 57], mel: [{ m: 84, d: 1 }, { m: 83, d: 1 }, { m: 81, d: 1 }] },
    { bass: 43, arp: [55, 59, 55, 59], mel: [{ m: 83, d: 1 }, { m: 84, d: 1 }, { m: 86, d: 1 }] },
    { bass: 38, arp: [54, 57, 54, 57], mel: [{ m: 81, d: 2 }, { m: 79, d: 1 }] },
    // Bars 5-8: Lyrical answer modulating to D
    { bass: 43, arp: [55, 59, 55, 59], mel: [{ m: 79, d: 2 }, { m: 83, d: 1 }] },
    { bass: 45, arp: [57, 61, 57, 61], mel: [{ m: 86, d: 1 }, { m: 85, d: 1 }, { m: 86, d: 1 }] },
    { bass: 50, arp: [57, 62, 57, 62], mel: [{ m: 86, d: 2 }, { m: 84, d: 1 }] },
    { bass: 45, arp: [57, 61, 57, 61], mel: [{ m: 81, d: 3 }] },
    // Bars 9-12: Gentle contemplative development in Em / C
    { bass: 40, arp: [55, 59, 55, 59], mel: [{ m: 83, d: 2 }, { m: 84, d: 1 }] },
    { bass: 36, arp: [52, 55, 52, 55], mel: [{ m: 84, d: 2 }, { m: 83, d: 1 }] },
    { bass: 41, arp: [53, 57, 53, 57], mel: [{ m: 81, d: 2 }, { m: 79, d: 1 }] },
    { bass: 38, arp: [54, 57, 54, 57], mel: [{ m: 78, d: 3 }] },
    // Bars 13-16: Joyful return to G major cadence
    { bass: 43, arp: [55, 59, 55, 59], mel: [{ m: 79, d: 2 }, { m: 83, d: 1 }] },
    { bass: 45, arp: [54, 57, 54, 57], mel: [{ m: 84, d: 1 }, { m: 83, d: 1 }, { m: 81, d: 1 }] },
    { bass: 38, arp: [54, 57, 54, 57], mel: [{ m: 83, d: 1 }, { m: 81, d: 1 }, { m: 78, d: 1 }] },
    { bass: 43, arp: [55, 59, 55, 59], mel: [{ m: 79, d: 3 }] },
  ];

  // 5 full cycles of 16 bars = 80 bars = 180.0s
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const bar of theme) {
      renderPianoNote(data, len, sr, t, bar.bass, barLen * 1.2, 0.32);
      const step = barLen / bar.arp.length;
      for (let i = 0; i < bar.arp.length; i++) {
        renderPianoNote(data, len, sr, t + i * step, bar.arp[i], step * 1.5, 0.16);
      }
      let mOffset = 0;
      for (const note of bar.mel) {
        renderPianoNote(data, len, sr, t + mOffset, note.m, note.d * beat * 1.2, 0.28);
        mOffset += note.d * beat;
      }
      t += barLen;
    }
  }
}

// 7. Johann Pachelbel: Canon in D Major (1680, 192.0s / 3:12)
function genPachelbel(data, len, sr) {
  const barLen = 4.0; // 4 beats per bar = 4.0s
  let t = 0.0;
  const progression = [
    { bass: 38, chord: [50, 54, 57] }, // D
    { bass: 33, chord: [45, 52, 57] }, // A
    { bass: 35, chord: [47, 50, 54] }, // Bm
    { bass: 30, chord: [42, 49, 54] }, // F#m
    { bass: 31, chord: [43, 47, 50] }, // G
    { bass: 38, chord: [50, 54, 57] }, // D
    { bass: 31, chord: [43, 47, 50] }, // G
    { bass: 33, chord: [45, 52, 57] }, // A
  ];

  const melodies = [
    [74, 73, 71, 69, 67, 66, 67, 69], // Var 1: Foundational warm theme
    [86, 85, 83, 81, 79, 78, 79, 81], // Var 2: Iconic soaring Canon theme
    [74, 76, 74, 73, 71, 74, 71, 73], // Var 3: Flowing counter-melody
    [86, 81, 83, 78, 79, 74, 79, 81], // Var 4: Gentle arpeggiated movement
    [74, 69, 71, 66, 67, 62, 67, 69], // Var 5: Cascading octave harmonies
    [74, 73, 71, 69, 67, 66, 67, 69], // Var 6: Peaceful closing resolution
  ];

  // 6 full cycles of 8 bars = 48 bars = 192.0s
  for (let cycle = 0; cycle < 6; cycle++) {
    const mel = melodies[cycle];
    for (let b = 0; b < progression.length; b++) {
      const p = progression[b];
      renderPianoNote(data, len, sr, t, p.bass, barLen * 1.4, 0.35);
      for (let i = 0; i < p.chord.length; i++) {
        renderPianoNote(data, len, sr, t + 1.0 + i * 0.9, p.chord[i], 2.2, 0.18);
      }
      const mNote = mel[b];
      renderPianoNote(data, len, sr, t + 0.5, mNote, barLen * 0.85, 0.28);
      t += barLen;
    }
  }
}

// 8. Light Rain: Gentle Raindrops & Sweet Comforting Piano (192.0s / 3:12)
// Delicate, soft raindrop pitter-patter paired with heartwarming, non-overpowering piano chords.
function genRain(data, len, sr) {
  const chords = [
    { bass: 50, notes: [62, 66, 69, 73], mel: [78, 76] }, // Dmaj9
    { bass: 45, notes: [57, 60, 64, 69], mel: [73, 71] }, // F#m7 / A
    { bass: 43, notes: [55, 59, 62, 67], mel: [71, 74] }, // Gmaj7
    { bass: 45, notes: [57, 62, 64, 69], mel: [76, 74] }, // Asus4
    { bass: 50, notes: [62, 66, 69, 73], mel: [81, 78] }, // Dmaj9 high
    { bass: 47, notes: [59, 62, 66, 71], mel: [78, 74] }, // Bm7
    { bass: 43, notes: [55, 59, 62, 67], mel: [74, 73] }, // Gmaj7
    { bass: 45, notes: [57, 61, 64, 69], mel: [71, 69] }, // A
  ];

  const chordDur = 4.8;
  let t = 0.0;
  // 5 full cycles = 5 * 38.4s = 192.0s
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const c of chords) {
      renderPianoNote(data, len, sr, t, c.bass, chordDur * 0.9, 0.26);
      c.notes.forEach((m, idx) => {
        renderPianoNote(data, len, sr, t + idx * 0.45, m, 2.5, 0.15);
      });
      c.mel.forEach((m, idx) => {
        renderPianoNote(data, len, sr, t + 1.8 + idx * 1.4, m, 2.2, 0.22);
      });
      t += chordDur;
    }
  }

  // Soft, delicate acoustic water droplets (never harsh or heavy)
  let dropT = 0.05;
  let seed = 42;
  const pseudoRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  while (dropT < (len / sr) - 0.1) {
    const interval = 0.18 + pseudoRand() * 0.35;
    dropT += interval;
    const startIdx = Math.floor(dropT * sr);
    if (startIdx >= len) break;

    const startFreq = 1800 + pseudoRand() * 1200;
    const dropDuration = 0.02 + pseudoRand() * 0.03;
    const dropSamples = Math.floor(dropDuration * sr);
    const dropVol = 0.03 + pseudoRand() * 0.04;

    for (let i = 0; i < dropSamples && (startIdx + i) < len; i++) {
      const dt = i / sr;
      const f = startFreq * (1 - dt * 20);
      const env = Math.exp(-dt * 110);
      data[startIdx + i] += Math.sin(2 * Math.PI * f * dt) * env * dropVol * 0.25;
    }
  }

  // Very soft continuous pink drizzle background
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const white = (pseudoRand() * 2 - 1) * 0.012;
    b0 = 0.997 * b0 + white * 0.05;
    b1 = 0.985 * b1 + white * 0.07;
    b2 = 0.950 * b2 + white * 0.12;
    data[i] += (b0 + b1 + b2) * 0.14;
  }
}

// 9. Forest Vibes: Gentle Breeze & Distant Calming Birdsong (180.0s / 3:00)
function genForest(data, len, sr) {
  let seed = 777;
  const pseudoRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // Gentle rustling breeze with slow organic wind breathing
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const white = (pseudoRand() * 2 - 1) * 0.018;
    b0 = 0.997 * b0 + white * 0.05;
    b1 = 0.985 * b1 + white * 0.07;
    b2 = 0.950 * b2 + white * 0.12;
    const pink = (b0 + b1 + b2);
    const wind = 0.55 + 0.35 * Math.sin(2 * Math.PI * (t / 12.0)) + 0.15 * Math.sin(2 * Math.PI * (t / 7.3));
    data[i] += pink * wind * 0.24;
  }

  // Sweet, distant birdsong chirps
  let chirpT = 2.0;
  while (chirpT < (len / sr) - 2.5) {
    chirpT += 3.5 + pseudoRand() * 5.0;
    const startIdx = Math.floor(chirpT * sr);
    if (startIdx >= len) break;

    const baseFreq = 2600 + pseudoRand() * 800;
    const notesInPhrase = 2 + Math.floor(pseudoRand() * 3);
    let phraseTime = 0;

    for (let n = 0; n < notesInPhrase; n++) {
      const noteFreq = baseFreq + (n % 2 === 0 ? 0 : 350) + pseudoRand() * 150;
      const chirpDur = 0.08 + pseudoRand() * 0.06;
      const chirpSamples = Math.floor(chirpDur * sr);
      const noteStart = startIdx + Math.floor(phraseTime * sr);

      for (let i = 0; i < chirpSamples && (noteStart + i) < len; i++) {
        const dt = i / sr;
        const env = Math.sin(Math.PI * (i / chirpSamples));
        const vib = Math.sin(2 * Math.PI * 18 * dt) * 40;
        const wave = Math.sin(2 * Math.PI * (noteFreq + vib) * dt);
        data[noteStart + i] += wave * env * 0.035;
      }
      phraseTime += chirpDur + 0.06 + pseudoRand() * 0.08;
    }
  }
}

// 10. Soft White Noise: Warm, soothing brown/pink blanket of sound (120.0s / 2:00)
function genSoftNoise(data, len, sr) {
  let seed = 12345;
  const pseudoRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = (pseudoRand() * 2 - 1) * 0.12;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    data[i] = pink * 0.28;
  }
}

export function playAmbient(kind = currentKind) {
  if (kind === 'classical') kind = 'satie';
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
    if (kind === 'gentle-rain' || kind === 'raindrops') {
      const b = createLoopBuffer(genRain, 192.0);
      BUFFERS.set('gentle-rain', b);
      BUFFERS.set('raindrops', b);
    } else if (kind === 'forest') BUFFERS.set('forest', createLoopBuffer(genForest, 180.0));
    else if (kind === 'soft-noise') BUFFERS.set('soft-noise', createLoopBuffer(genSoftNoise, 120.0));
    else if (kind === 'satie') BUFFERS.set('satie', createLoopBuffer(genSatie, 191.4));
    else if (kind === 'debussy') BUFFERS.set('debussy', createLoopBuffer(genDebussy, 197.6));
    else if (kind === 'bach') BUFFERS.set('bach', createLoopBuffer(genBach, 196.0));
    else if (kind === 'beethoven') BUFFERS.set('beethoven', createLoopBuffer(genBeethoven, 216.0));
    else if (kind === 'chopin') BUFFERS.set('chopin', createLoopBuffer(genChopin, 192.0));
    else if (kind === 'mozart') BUFFERS.set('mozart', createLoopBuffer(genMozart, 180.0));
    else if (kind === 'pachelbel') BUFFERS.set('pachelbel', createLoopBuffer(genPachelbel, 192.0));
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
  if (kind === 'classical') kind = 'satie';
  const valid = [
    'gentle-rain',
    'raindrops',
    'forest',
    'soft-noise',
    'satie',
    'debussy',
    'bach',
    'beethoven',
    'chopin',
    'mozart',
    'pachelbel',
  ];
  if (!valid.includes(kind)) kind = 'none';
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
