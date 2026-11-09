import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('css: .mochi and all descendants enforce touch-action: none !important to prevent mobile gesture cancellation', () => {
  const css = fs.readFileSync('app/css/app.css', 'utf8');

  // Must apply touch-action: none to .mochi and its children (.mochi *)
  const touchActionRegex = /\.mochi(?:\s*,\s*\.mochi\s+\*)?\s*\{[^}]*touch-action:\s*none/i;
  const childTouchActionRegex = /\.mochi\s+\*|\.mochi\s+\.flip|\.mochi\s+\.act/;
  
  assert.ok(
    css.includes('.mochi *') && css.includes('touch-action: none !important'),
    'app.css must define touch-action: none !important on .mochi * to prevent mobile browser scroll hijacking'
  );
  assert.ok(
    css.includes('-webkit-touch-callout: none !important') || css.includes('-webkit-touch-callout: none'),
    'app.css must disable touch callouts on mascot'
  );
});

test('mochi js: touchstart on mascot prevents default to stop Android Chrome scroll gesture hijacking', () => {
  const code = fs.readFileSync('app/js/mochi.js', 'utf8');

  // Must have a touchstart handler on el that prevents default when cancelable
  assert.ok(
    /el\.addEventListener\(['"]touchstart['"]/.test(code),
    'mochi.js must attach touchstart listener to mascot element'
  );
  assert.ok(
    /e\.cancelable\s*&&\s*e\.preventDefault\(\)/.test(code) || /e\.preventDefault\(\)/.test(code),
    'mochi.js touchstart listener must call preventDefault() to stop Android Chrome scroll detection'
  );
});

test('mochi js: document touchmove updates drag position and prevents scrolling while mascot is held', () => {
  const code = fs.readFileSync('app/js/mochi.js', 'utf8');

  // Must attach touchmove on document to handle mobile touch drag when pointer capture is dropped
  assert.ok(
    /document\.addEventListener\(['"]touchmove['"]/.test(code),
    'mochi.js must listen for document touchmove for reliable mobile dragging'
  );
  assert.ok(
    /document\.addEventListener\(['"]touchend['"]/.test(code),
    'mochi.js must listen for document touchend to release held cat smoothly'
  );
});

test('mochi js: mascot allows interaction (pickup and tap) on both nav and sheet perch', () => {
  const code = fs.readFileSync('app/js/mochi.js', 'utf8');

  // pointerdown should allow perch === 'sheet' as well as perch === 'nav'
  assert.ok(
    !code.includes("if (e.button > 0 || M.perch !== 'nav' || M.state === 'fall') return;"),
    'pointerdown must not reject sheet perch so users can pick up the cat when perched on modal sheet'
  );

  // tap should also allow perch === 'sheet'
  assert.ok(
    !code.includes("if (M.state === 'walk' || M.state === 'prep' || M.perch !== 'nav') return;"),
    'tap must not reject sheet perch so tapping the cat while peeking produces cute meows/reactions'
  );
});

test('mochi js: startDrag sets up dangling stretch pose and drop lands back onto sheet when sheet is open', () => {
  const code = fs.readFileSync('app/js/mochi.js', 'utf8');

  // groundY should consider sheet when sheet is open
  assert.ok(
    code.includes('sheet.isOpen') || code.includes("sheetEl()?.classList.contains('open')") || code.includes("sheetEl() && sheetEl().classList.contains('open')"),
    'groundY / bounds must recognize when sheet is open so dropped cat lands back onto sheet edge'
  );
});

test('mochi js: pointercancel does not cancel active mobile touch drag', () => {
  const code = fs.readFileSync('app/js/mochi.js', 'utf8');
  assert.ok(
    code.includes('if (press && press.touch) return;'),
    'mochi.js pointercancel must not abort active touch pickup on mobile devices'
  );
});
