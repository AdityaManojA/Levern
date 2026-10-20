// Handwriting to text with the browser's Handwriting Recognition API. It runs on the device, costs nothing
// and needs no internet, but only Chrome on Android and ChromeOS ship it today. Everywhere else the
// writing is kept as ink on the quest (a sketch) and nothing is sent anywhere.

const nav = typeof navigator === 'undefined' ? {} : navigator;
let support = null;   // cached promise of the language tag that works, or null

export function handwritingLanguage() {
  if (!support) support = (async () => {
    if (typeof nav.createHandwritingRecognizer !== 'function') return null;
    const full = nav.language || 'en', tags = [...new Set([full, full.split('-')[0], 'en'])];
    for (const lang of tags) {
      try {
        if (nav.queryHandwritingRecognizer) { if (await nav.queryHandwritingRecognizer({ languages: [lang] })) return lang; continue; }
        if (nav.queryHandwritingRecognizerSupport) { const r = await nav.queryHandwritingRecognizerSupport({ languages: [lang] }); if (r && r.languages) return lang; continue; }
        // no query function: try making one
        const rec = await nav.createHandwritingRecognizer({ languages: [lang] }); rec.finish(); return lang;
      } catch (e) {}
    }
    return null;
  })();
  return support;
}

// strokes: [[{ x, y, t }]] with t in ms -> best guesses, most likely first ([] when nothing was read)
export async function recognize(strokes, inputType = 'touch') {
  const lang = await handwritingLanguage();
  if (!lang || !strokes.length) return [];
  const rec = await nav.createHandwritingRecognizer({ languages: [lang] });
  try {
    const drawing = rec.startDrawing({ recognitionType: 'text', inputType, alternatives: 3 });
    for (const pts of strokes) {
      const hs = new window.HandwritingStroke();
      for (const p of pts) hs.addPoint({ x: p.x, y: p.y, t: p.t });
      drawing.addStroke(hs);
    }
    const preds = await drawing.getPrediction();
    return (preds || []).map(p => (p.text || '').trim()).filter(Boolean);
  } finally {
    try { rec.finish(); } catch (e) {}
  }
}

export const HANDWRITING_HELP = 'Handwriting turns into text in Chrome on Android tablets and phones and on Chromebooks. On this device your writing is saved as ink on the quest instead.';
