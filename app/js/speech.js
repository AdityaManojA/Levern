// Voice entry with the Web Speech API. In Chrome and Edge the audio is sent to the browser maker's speech
// service; some Chromium browsers (Brave, Opera, Vivaldi, embedded browsers) don't have that service and
// always answer "network" even when online. So on a "network" error we try once more, then Chrome's
// on-device recognition where it exists (processLocally), and only then give up with a clear message.
// Firefox has no speech recognition at all; the mic button says so and you type instead.
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
export const speechSupported = !!Rec;
let broken = false;   // set once this browser has shown it can't do voice input
export const speechBroken = () => broken;

export function browserName() {
  const ua = navigator.userAgent;
  if (navigator.brave) return 'Brave';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Vivaldi/.test(ua)) return 'Vivaldi';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Electron/.test(ua)) return 'this built-in browser';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'this browser';
}

const lang = () => navigator.language || 'en-GB';
async function onDeviceReady() {
  try {
    if (!Rec.available || !('processLocally' in Rec.prototype)) return false;
    const st = await Rec.available({ langs: [lang()], processLocally: true });
    if (st === 'available') return true;
    if (st === 'downloadable' || st === 'downloading') return Rec.install ? await Rec.install({ langs: [lang()], processLocally: true }) : false;
  } catch (e) {}
  return false;
}

// listen({ onText(text, final), onEnd(), onError(code), onStatus(text) }) -> stop()
export function listen({ onText, onEnd, onError, onStatus }) {
  let r = null, stopped = false, gotText = false, attempt = 0;
  function start(local) {
    r = new Rec();
    r.lang = lang(); r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    if (local) r.processLocally = true;
    r.onresult = e => {
      let text = '', final = false;
      for (const res of e.results) { text += res[0].transcript; final = res.isFinal; }
      gotText = true; onText(text.trim(), final);
    };
    let failed = null;
    r.onerror = e => { failed = e.error; };
    r.onend = async () => {
      if (stopped || failed !== 'network' || gotText) { if (failed && failed !== 'aborted') onError && onError(failed); onEnd && onEnd(); return; }
      attempt++;
      if (attempt === 1) { start(local); return; }   // a blip: try once more
      if (!local && await onDeviceReady()) { onStatus && onStatus('Using on-device voice'); start(true); return; }
      broken = true;
      onError && onError('unavailable');
      onEnd && onEnd();
    };
    try { r.start(); } catch (e) { onError && onError('start-failed'); onEnd && onEnd(); }
  }
  start(false);
  // stop: finish what was heard so far, and release the microphone even if the browser doesn't end the session
  return () => {
    stopped = true;
    try { r && r.stop(); } catch (e) {}
    setTimeout(() => { try { r && r.abort(); } catch (e) {} }, 1200);
  };
}

export function speechError(code) {
  const b = browserName();
  return {
    'not-allowed': 'Microphone access is blocked. Allow it in the browser to use voice.',
    'service-not-allowed': 'Voice input is turned off in this browser.',
    'no-speech': "Didn't catch anything. Try again.",
    'audio-capture': 'No microphone found.',
    network: 'Voice input lost its connection. Try again.',
    unavailable: b === 'Chrome' || b === 'Edge'
      ? `${b} couldn't reach its speech service. Check your connection, or type it instead.`
      : `Voice input isn't available in ${b}. Try Chrome, Edge or Safari, or type it instead.`,
    'start-failed': 'Voice input could not start. Type it instead.',
  }[code] || 'Voice input stopped.';
}
