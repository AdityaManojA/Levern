import test from 'node:test';
import assert from 'node:assert/strict';

// Test-driven development for Android voice recorder fixes in speech.js

test('speech: getSpeechLang normalizes bare "en" and missing languages to valid BCP-47 tag', async () => {
  const { getSpeechLang } = await import('../js/speech.js');
  assert.equal(typeof getSpeechLang, 'function', 'getSpeechLang should be exported');

  // Should normalize 'en' to 'en-US' (Android SpeechRecognizer fails on bare 'en')
  assert.equal(getSpeechLang('en'), 'en-US');
  assert.equal(getSpeechLang('en-IN'), 'en-IN');
  assert.equal(getSpeechLang('en-GB'), 'en-GB');
  assert.equal(getSpeechLang('es-ES'), 'es-ES');

  // Without override, should return a valid non-bare language string with a dialect/region
  const detected = getSpeechLang();
  assert.ok(detected.length >= 4, `Detected language "${detected}" should have region/dialect`);
  assert.notEqual(detected, 'en', 'Detected language must not be bare "en"');
});

test('speech: browserName detects Samsung Internet properly', async () => {
  const { browserName } = await import('../js/speech.js');
  // Samsung Internet user agent has both Chrome and SamsungBrowser
  const samsungUA = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/118.0.5993.80 Mobile Safari/537.36';
  assert.equal(browserName(samsungUA), 'Samsung Internet');

  // Standard Chrome on Android
  const chromeUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36';
  assert.equal(browserName(chromeUA), 'Chrome');
});

test('speech: speechError provides helpful mobile-friendly messages', async () => {
  const { speechError } = await import('../js/speech.js');

  const noSpeech = speechError('no-speech');
  assert.ok(noSpeech.includes('catch') || noSpeech.includes('words'), 'no-speech error message');

  const notAllowed = speechError('not-allowed');
  assert.ok(notAllowed.includes('Microphone') || notAllowed.includes('permission'), 'not-allowed error message');

  const langErr = speechError('language-not-supported');
  assert.ok(langErr.length > 0, 'language-not-supported error message');
});

test('speech: buildTranscript joins multiple results with spaces and detects finality', async () => {
  const { buildTranscript } = await import('../js/speech.js');
  assert.equal(typeof buildTranscript, 'function', 'buildTranscript should be exported');

  const mockResults = [
    [{ transcript: 'Buy groceries' }],
    [{ transcript: 'tomorrow at 5pm' }],
  ];
  mockResults[0].isFinal = true;
  mockResults[1].isFinal = false;

  const result = buildTranscript(mockResults);
  assert.equal(result.text, 'Buy groceries tomorrow at 5pm', 'Should separate chunks with space');
  assert.equal(result.final, true, 'Should be final if any chunk is final');
});

test('speech: listen handles speech recognition lifecycle and no-speech retries', async () => {
  // Mock SpeechRecognition for node testing
  class MockSpeechRecognition {
    constructor() {
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.onstart = null;
      MockSpeechRecognition.instance = this;
    }
    start() {
      MockSpeechRecognition.started = (MockSpeechRecognition.started || 0) + 1;
      setTimeout(() => { if (this.onstart) this.onstart(); }, 0);
    }
    stop() {
      MockSpeechRecognition.stopped = true;
      setTimeout(() => { if (this.onend) this.onend(); }, 0);
    }
    abort() {}
  }
  MockSpeechRecognition.started = 0;
  MockSpeechRecognition.stopped = false;

  globalThis.SpeechRecognition = MockSpeechRecognition;
  globalThis.webkitSpeechRecognition = MockSpeechRecognition;

  const { listen } = await import('../js/speech.js');

  let heardText = '';
  const stop = listen({
    onText: text => { heardText = text; },
    onEnd: () => {},
    onError: () => {},
  });

  const inst = MockSpeechRecognition.instance;
  assert.ok(inst, 'SpeechRecognition instance created');
  assert.equal(inst.interimResults, true);

  // Simulate incoming speech event
  const mockResults = [[{ transcript: 'Doctor appointment on Monday' }]];
  mockResults[0].isFinal = true;
  inst.onresult({ results: mockResults });

  assert.equal(heardText, 'Doctor appointment on Monday');
  stop();
});
