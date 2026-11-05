import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.resolve(__dirname, '../css/app.css');
const jsPath = path.resolve(__dirname, '../js/mochi.js');

test('mascot view transition isolation: prevents root transition capture, smearing and ghosting', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /\.mochi\s*\{[^}]*view-transition-name:\s*mochi/s, '.mochi must have view-transition-name: mochi');
  assert.match(css, /\.mbubble\s*\{[^}]*view-transition-name:\s*mbubble/s, '.mbubble must have view-transition-name: mbubble');
  assert.match(css, /\.mcard\s*\{[^}]*view-transition-name:\s*mcard/s, '.mcard must have view-transition-name: mcard');
  assert.match(css, /::view-transition-(?:old|new)\(mochi\)[^{]*\{\s*animation:\s*none/s, 'must disable view transition animation for mascot');
});

test('mascot clipping logic: never clips mascot while being dragged or falling', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  const clipLineMatch = js.match(/el\.style\.clipPath\s*=\s*([^;]+);/);
  assert.ok(clipLineMatch, 'el.style.clipPath must be set');
  const clipExpr = clipLineMatch[1];
  assert.match(clipExpr, /M\.state\s*===\s*['"]drag['"]\s*\|\|\s*M\.state\s*===\s*['"]fall['"]/, 'clipPath expression must explicitly check M.state === "drag" || M.state === "fall" and bypass clipping');
});

test('mascot sheet layering: speech bubbles and cards stay visible above sheet and scrim', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /\.mochi\.over\s*~\s*\.mbubble/s, '.mochi.over ~ .mbubble must be styled for sheet overlay');
  assert.match(css, /\.mochi\.over\s*~\s*\.mcard/s, '.mochi.over ~ .mcard must be styled for sheet overlay');
});

test('mascot groundY and bounds: safe against null nav and sheet element', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /function\s+groundY\(\)[\s\S]*?nav\(\)\?\./, 'groundY must use safe navigation on nav()');
  assert.match(js, /function\s+bounds\(\)[\s\S]*?nav\(\)\?\./, 'bounds must use safe navigation on nav()');
  // Check that groundY doesn't jump to sheet top if M.perch is still 'nav'
  assert.doesNotMatch(js, /function\s+groundY\(\)\s*\{\s*return\s*\(M\.perch\s*===\s*['"]sheet['"]\s*\|\|\s*isSheetOpen\(\)\)/, 'groundY must not check isSheetOpen() when M.perch is still nav');
});

test('mascot ghost element cleanup: removes ghost immediately on hide, away, or cat switch', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /setVisible\([^)]*\)\s*\{[\s\S]*?(?:ghostEl\?\.remove|removeGhost)\(\)/, 'setVisible must remove ghostEl');
  assert.match(js, /away\([^)]*\)\s*\{[\s\S]*?(?:ghostEl\?\.remove|removeGhost)\(\)/, 'away must remove ghostEl');
});
