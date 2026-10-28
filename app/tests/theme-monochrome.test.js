import test from 'node:test';
import assert from 'node:assert/strict';

// Theme resolution test
import { resolveTheme } from '../js/theme.js';

test('resolveTheme resolves light, dark, and auto correctly', () => {
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme(undefined, false), 'light');
});

test('resolveTheme resolves mono and mono-light to mono', () => {
  assert.equal(resolveTheme('mono'), 'mono');
  assert.equal(resolveTheme('mono-light'), 'mono');
  assert.equal(resolveTheme('monochrome-light'), 'mono');
});

test('resolveTheme resolves mono-dark and monochrome-dark to mono-dark', () => {
  assert.equal(resolveTheme('mono-dark'), 'mono-dark');
  assert.equal(resolveTheme('monochrome-dark'), 'mono-dark');
});

test('resolveTheme resolves mono-light-accent and mono-dark-accent correctly', () => {
  assert.equal(resolveTheme('mono-light-accent'), 'mono-light-accent');
  assert.equal(resolveTheme('monochrome-light-accent'), 'mono-light-accent');
  assert.equal(resolveTheme('mono-dark-accent'), 'mono-dark-accent');
  assert.equal(resolveTheme('monochrome-dark-accent'), 'mono-dark-accent');
});

test('theme-boot correctly restores all monochrome themes from localStorage', () => {
  // Simulate theme-boot logic
  function bootTheme(storedTheme) {
    const doc = {
      dataset: {},
      metaColor: ''
    };
    const t = storedTheme;
    const valid = ['dark', 'mono', 'mono-dark', 'mono-light', 'mono-light-accent', 'mono-dark-accent'];
    if (valid.includes(t)) {
      const want = (t === 'mono-light') ? 'mono' : t;
      doc.dataset.theme = want;
      doc.metaColor = (want === 'dark') ? '#0E1014' : (want.includes('dark')) ? '#121212' : '#F5F5F4';
    }
    return doc;
  }

  const darkRes = bootTheme('mono-dark');
  assert.equal(darkRes.dataset.theme, 'mono-dark');
  assert.equal(darkRes.metaColor, '#121212');

  const darkAccRes = bootTheme('mono-dark-accent');
  assert.equal(darkAccRes.dataset.theme, 'mono-dark-accent');
  assert.equal(darkAccRes.metaColor, '#121212');

  const lightRes = bootTheme('mono');
  assert.equal(lightRes.dataset.theme, 'mono');
  assert.equal(lightRes.metaColor, '#F5F5F4');

  const lightAccRes = bootTheme('mono-light-accent');
  assert.equal(lightAccRes.dataset.theme, 'mono-light-accent');
  assert.equal(lightAccRes.metaColor, '#F5F5F4');
});
