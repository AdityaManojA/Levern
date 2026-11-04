// Voice entry with the Web Speech API.
// In Chrome and Edge, speech audio is processed with speech recognition services.
// On Android devices, speech recognition requires careful handling of language tags (e.g. 'en-US' vs bare 'en'),
// silence timeouts (no-speech retries), multi-result transcript spacing, and continuous listening.
const getRec = () => {
  if (typeof window !== 'undefined') return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  if (typeof globalThis !== 'undefined') return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
  return null;
};

export const speechSupported = typeof window !== 'undefined' ? !!getRec() : true;
let broken = false;
export const speechBroken = () => broken;
export const resetSpeechBroken = () => { broken = false; };

export function browserName(ua) {
  ua = ua || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (typeof navigator !== 'undefined' && navigator.brave) return 'Brave';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/Vivaldi/i.test(ua)) return 'Vivaldi';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Electron/i.test(ua)) return 'this built-in browser';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  return 'this browser';
}

// Android speech recognizer strictly requires a regional dialect tag (e.g. 'en-US' or 'en-IN')
// and fails if passed a bare 2-letter language code like 'en'
export function getSpeechLang(override) {
  if (override) {
    const trimmed = String(override).trim();
    if (trimmed === 'en') return 'en-US';
    return trimmed;
  }
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const l = (nav.language || (nav.languages && nav.languages[0]) || 'en-US').trim();
  if (l === 'en' || !l) return 'en-US';
  return l;
}

// Aggregates interim and final results cleanly across mobile and desktop
export function buildTranscript(results) {
  if (!results) return { text: '', final: false };
  let text = '', final = false;
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const chunk = (res && res[0]?.transcript ? res[0].transcript : '').trim();
    if (!chunk) continue;
    text += (text ? ' ' : '') + chunk;
    if (res.isFinal) final = true;
  }
  return { text, final };
}

// listen({ onText(text, final), onEnd(), onError(code), onStatus(text) }) -> stop()
export function listen({ onText, onEnd, onError, onStatus }) {
  const Rec = getRec();
  if (!Rec) {
    onError && onError('unavailable');
    onEnd && onEnd();
    return () => {};
  }

  let r = null, stopped = false, gotText = false, noSpeechAttempts = 0, networkAttempts = 0;

  function start() {
    if (stopped) return;
    try {
      r = new Rec();
    } catch (e) {
      onError && onError('start-failed');
      onEnd && onEnd();
      return;
    }

    // Use continuous mode so Android Chrome does not cut off after brief pauses
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.lang = getSpeechLang();

    r.onresult = e => {
      if (stopped) return;
      const { text, final } = buildTranscript(e.results);
      if (text) {
        gotText = true;
        onText && onText(text, final);
      }
    };

    let failed = null;
    r.onerror = e => {
      failed = e.error || 'error';
    };

    r.onend = () => {
      if (stopped) {
        onEnd && onEnd();
        return;
      }

      // If user paused briefly on Android before speaking, give them a chance instead of aborting
      if (failed === 'no-speech' && !gotText && noSpeechAttempts < 2) {
        noSpeechAttempts++;
        onStatus && onStatus('Listening… speak now');
        start();
        return;
      }

      // Single network glitch on mobile data shouldn't permanently kill the mic
      if (failed === 'network' && networkAttempts < 1) {
        networkAttempts++;
        start();
        return;
      }

      if (failed && failed !== 'aborted') {
        if (failed === 'network' && browserName() !== 'Chrome' && browserName() !== 'Edge') {
          broken = true;
        }
        onError && onError(failed);
      }

      onEnd && onEnd();
    };

    try {
      r.start();
    } catch (e) {
      // If already started or failed to initialize, notify and end
      if (failed !== 'no-speech') {
        onError && onError('start-failed');
      }
      onEnd && onEnd();
    }
  }

  start();

  // stop: clean release of the microphone
  return () => {
    stopped = true;
    try {
      if (r) {
        if (typeof r.stop === 'function') r.stop();
        setTimeout(() => {
          try { if (r && typeof r.abort === 'function') r.abort(); } catch (_) {}
        }, 600);
      }
    } catch (_) {}
  };
}

export function speechError(code) {
  const b = browserName();
  return {
    'not-allowed': 'Microphone access is blocked. Allow it in the browser to use voice.',
    'service-not-allowed': 'Voice input is turned off in this browser.',
    'no-speech': "Didn't catch any words. Tap the mic and speak clearly.",
    'audio-capture': 'No microphone found or mic is currently in use.',
    'language-not-supported': 'Language not supported for voice input on this device.',
    network: 'Voice input lost its connection. Check your network and try again.',
    unavailable: b === 'Chrome' || b === 'Edge'
      ? `${b} couldn't reach its speech service. Check your connection, or type it instead.`
      : `Voice input isn't available in ${b}. Try Google Chrome, Edge or Safari, or type it instead.`,
    'start-failed': 'Voice input could not start. Type it instead.',
  }[code] || 'Voice input stopped.';
}
