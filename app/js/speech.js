// Voice entry with the Web Speech API (Chrome, Edge, Safari). Firefox has no speech recognition,
// so the mic button explains that and the user types instead.
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
export const speechSupported = !!Rec;

// listen({ onText(text, final), onEnd(), onError(code) }) -> stop()
export function listen({ onText, onEnd, onError }) {
  const r = new Rec();
  r.lang = navigator.language || 'en-GB';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  r.onresult = e => {
    let text = '', final = false;
    for (const res of e.results) { text += res[0].transcript; final = res.isFinal; }
    onText(text.trim(), final);
  };
  r.onerror = e => onError && onError(e.error);
  r.onend = () => onEnd && onEnd();
  try { r.start(); } catch (e) { onError && onError('start-failed'); }
  return () => { try { r.stop(); } catch (e) {} };
}

export function speechError(code) {
  return {
    'not-allowed': 'Microphone access is blocked. Allow it in the browser to use voice.',
    'service-not-allowed': 'Voice input is turned off in this browser.',
    'no-speech': "Didn't catch anything. Try again.",
    'audio-capture': 'No microphone found.',
    network: 'Voice input needs an internet connection in this browser.',
  }[code] || 'Voice input stopped.';
}
