import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock browser environment for modules that touch document / window
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener: () => {} }));
globalThis.location = globalThis.location || { origin: 'http://localhost', pathname: '/', hash: '#/home' };
globalThis.window = globalThis.window || {
  addEventListener: () => {},
  matchMedia: globalThis.matchMedia,
  location: globalThis.location,
  navigator: globalThis.navigator,
};
globalThis.document = globalThis.document || {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  documentElement: { dataset: {} },
};
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

test('mascot label: returns Cookie for cookie/ginger and Mochi for black', async () => {
  const { init, setSetting } = await import('../js/store.js');
  const { catLabel } = await import('../js/mochi.js');

  init();
  setSetting('mochiColor', 'black');
  assert.equal(catLabel(), 'Mochi');

  setSetting('mochiColor', 'cookie');
  assert.equal(catLabel(), 'Cookie');

  setSetting('mochiColor', 'ginger');
  assert.equal(catLabel(), 'Cookie');
});

test('onboarding tour prompt: speech bubble uses active cat label', async () => {
  const { init, setSetting } = await import('../js/store.js');
  const { tourPromptHTML } = await import('../js/views/onboarding.js');

  init();
  setSetting('mochiColor', 'cookie');
  const cookieHtml = tourPromptHTML();
  assert.ok(cookieHtml.includes("Hi, I'm Cookie!"), 'Should say "Hi, I\'m Cookie!" when Cookie is active');
  assert.ok(!cookieHtml.includes("Hi, I'm Mochi!"), 'Should not say "Hi, I\'m Mochi!" when Cookie is active');

  setSetting('mochiColor', 'black');
  const mochiHtml = tourPromptHTML();
  assert.ok(mochiHtml.includes("Hi, I'm Mochi!"), 'Should say "Hi, I\'m Mochi!" when Mochi is active');
});

test('tour steps: step descriptions and finish action use active cat label', async () => {
  const { init, setSetting } = await import('../js/store.js');
  const { getTourSteps, tourCardHTML } = await import('../js/views/tour.js');

  init();
  setSetting('mochiColor', 'cookie');
  const cookieSteps = getTourSteps();
  const meetStep = cookieSteps.find(s => s.title.includes('Meet'));
  assert.ok(meetStep, 'Tour should have a Meet step');
  assert.equal(meetStep.title, 'Meet Cookie');
  assert.ok(meetStep.text.includes('Cookie walks along the nav bar'));

  const pickUpStep = cookieSteps.find(s => s.title.includes('Pick'));
  assert.ok(pickUpStep);
  assert.equal(pickUpStep.title, 'Pick Cookie up');
  assert.ok(pickUpStep.text.includes('Drag Cookie anywhere along the bar'));

  const focusStep = cookieSteps.find(s => s.title === 'Focus mode');
  assert.ok(focusStep.text.includes('Cookie naps while you focus'));

  const settingsStep = cookieSteps.find(s => s.title === 'Make it yours');
  assert.ok(settingsStep.text.includes('tune Cookie here'));

  const finishCardCookie = tourCardHTML(cookieSteps.length - 1, true);
  assert.ok(finishCardCookie.includes('Drag Cookie, or tap him, to finish'));

  // Switch to Mochi
  setSetting('mochiColor', 'black');
  const mochiSteps = getTourSteps();
  const meetStepMochi = mochiSteps.find(s => s.title.includes('Meet'));
  assert.equal(meetStepMochi.title, 'Meet Mochi');
  assert.ok(meetStepMochi.text.includes('Mochi walks along the nav bar'));

  const pickUpStepMochi = mochiSteps.find(s => s.title.includes('Pick'));
  assert.ok(pickUpStepMochi);
  assert.equal(pickUpStepMochi.title, 'Pick Mochi up');

  const finishCardMochi = tourCardHTML(mochiSteps.length - 1, true);
  assert.ok(finishCardMochi.includes('Drag Mochi, or tap him, to finish'));
});

test('theme options: clean names and zero emojis on theme options', async () => {
  const { render } = await import('../js/views/settings.js');
  const html = render();

  // Clean names
  assert.ok(html.includes('>Light Mode</option>'));
  assert.ok(html.includes('>Dark Mode</option>'));
  assert.ok(html.includes('>Monochrome Dark</option>'));

  // Zero emojis in theme select
  assert.ok(!html.includes('>☀️'));
  assert.ok(!html.includes('>🌙'));
  assert.ok(!html.includes('>⚪'));
  assert.ok(!html.includes('>⚫'));
  assert.ok(!html.includes('🎨'));
  assert.ok(!html.includes('✨'));
  assert.ok(!html.includes('📱'));

  // Clean text labels for accents and follow device
  assert.ok(html.includes('>Monochrome Light Accent</option>'));
  assert.ok(html.includes('>Monochrome Dark Accent</option>'));
  assert.ok(html.includes('>Follow Device</option>'));
});

test('changelog: descriptions are user-centric without internal developer jargon', async () => {
  const { CHANGELOG } = await import('../js/changelog.js');
  const forbiddenDevJargon = [
    'IndexedDB',
    'spritesheet',
    'anti-cheat drift',
    'procedural',
    'zero-copyright, commercial-safe',
  ];

  for (const entry of CHANGELOG) {
    const text = [
      entry.title || '',
      entry.note || '',
      entry.tip || '',
      ...(entry.items || []),
    ].join(' ');

    for (const jargon of forbiddenDevJargon) {
      assert.ok(
        !text.includes(jargon),
        `Changelog entry ${entry.v} should not contain developer jargon "${jargon}": "${text}"`
      );
    }
  }
});
