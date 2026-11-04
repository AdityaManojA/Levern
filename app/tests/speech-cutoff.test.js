import test from 'node:test';
import assert from 'node:assert/strict';

// Test-driven development for slowed down voice recorder cutoff time

test('speech: exports SILENCE_CUTOFF_MS with relaxed pause duration of at least 3500ms', async () => {
  const { SILENCE_CUTOFF_MS } = await import('../js/speech.js');
  assert.equal(typeof SILENCE_CUTOFF_MS, 'number', 'SILENCE_CUTOFF_MS must be exported as a number');
  assert.ok(SILENCE_CUTOFF_MS >= 3500, `SILENCE_CUTOFF_MS (${SILENCE_CUTOFF_MS}ms) should be at least 3500ms to prevent premature cutoff`);
});

test('speech: listen keeps listening across brief pauses after speech and combines transcript segments', async () => {
  class MockSpeech {
    constructor() {
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      MockSpeech.instances.push(this);
    }
    start() {
      MockSpeech.starts++;
    }
    stop() {
      MockSpeech.stopped = true;
      if (this.onend) this.onend();
    }
    abort() {}
  }
  MockSpeech.instances = [];
  MockSpeech.starts = 0;
  MockSpeech.stopped = false;

  globalThis.SpeechRecognition = MockSpeech;
  globalThis.webkitSpeechRecognition = MockSpeech;

  const { listen, SILENCE_CUTOFF_MS } = await import('../js/speech.js');

  let fullHeardText = '';
  let ended = false;

  const stop = listen({
    silenceCutoffMs: 800, // use 800ms for fast test execution
    onText: text => { fullHeardText = text; },
    onEnd: () => { ended = true; },
  });

  const inst1 = MockSpeech.instances[0];
  assert.ok(inst1, 'First SpeechRecognition instance created');

  // 1. User speaks first phrase: "Buy groceries"
  inst1.onresult({
    results: [{ 0: { transcript: 'Buy groceries' }, isFinal: true, length: 1 }],
  });
  assert.equal(fullHeardText, 'Buy groceries');

  // 2. Browser fires onend after a brief pause (e.g. 100ms)
  inst1.onend();

  // Recorder should NOT have ended because silence cutoff has not expired
  assert.equal(ended, false, 'Recorder must not end immediately when browser pauses');
  assert.equal(MockSpeech.starts, 2, 'Should have restarted recognition to continue listening');

  // 3. User speaks second phrase in the new instance: "at 5pm"
  const inst2 = MockSpeech.instances[1];
  assert.ok(inst2, 'Second SpeechRecognition instance created');
  inst2.onresult({
    results: [{ 0: { transcript: 'at 5pm' }, isFinal: true, length: 1 }],
  });

  // Transcript should seamlessly combine both phrases
  assert.equal(fullHeardText, 'Buy groceries at 5pm');
  assert.equal(ended, false);

  // Clean up
  stop();
});

test('speech: listen gracefully ends after silence exceeds silenceCutoffMs', async () => {
  class MockSpeech {
    constructor() {
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      MockSpeech.instance = this;
    }
    start() {}
    stop() { if (this.onend) this.onend(); }
    abort() {}
  }
  globalThis.SpeechRecognition = MockSpeech;
  globalThis.webkitSpeechRecognition = MockSpeech;

  const { listen } = await import('../js/speech.js');

  let ended = false;
  let textHeard = '';

  const stop = listen({
    silenceCutoffMs: 60, // fast cutoff for test
    onText: text => { textHeard = text; },
    onEnd: () => { ended = true; },
  });

  const inst = MockSpeech.instance;
  inst.onresult({
    results: [{ 0: { transcript: 'Finish homework' }, isFinal: true, length: 1 }],
  });
  assert.equal(textHeard, 'Finish homework');

  // Simulate browser engine pause
  inst.onend();

  assert.equal(ended, false);

  // Wait for silence cutoff to elapse (60ms + margin)
  await new Promise(r => setTimeout(r, 100));

  assert.equal(ended, true, 'Recorder should end once sustained silence exceeds cutoff time');
});
