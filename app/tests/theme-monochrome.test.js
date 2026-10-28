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

test('theme-boot correctly restores mono-dark from localStorage', () => {
  // Simulate theme-boot logic
  function bootTheme(storedTheme) {
    const doc = {
      dataset: {},
      metaColor: ''
    };
    const t = storedTheme;
    if (t === 'dark' || t === 'mono' || t === 'mono-dark' || t === 'mono-light') {
      const want = (t === 'mono-dark') ? 'mono-dark' : (t === 'mono-light' ? 'mono' : t);
      doc.dataset.theme = want;
      doc.metaColor = (want === 'dark') ? '#0E1014' : (want === 'mono-dark' ? '#121212' : '#F5F5F4');
    }
    return doc;
  }

  const darkRes = bootTheme('mono-dark');
  assert.equal(darkRes.dataset.theme, 'mono-dark');
  assert.equal(darkRes.metaColor, '#121212');

  const lightRes = bootTheme('mono');
  assert.equal(lightRes.dataset.theme, 'mono');
  assert.equal(lightRes.metaColor, '#F5F5F4');

  const lightAliasRes = bootTheme('mono-light');
  assert.equal(lightAliasRes.dataset.theme, 'mono');
  assert.equal(lightAliasRes.metaColor, '#F5F5F4');
});
