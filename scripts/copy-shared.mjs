// Copies the app's pure modules (no DOM) into functions/shared so the server builds the same
// calendar feed, Google events and merges as the app. Runs before every functions deploy
// (firebase.json predeploy) and before the functions tests.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(repo, 'functions', 'shared');
mkdirSync(out, { recursive: true });
for (const f of ['dates.js', 'ics.js', 'gcalmap.js', 'syncmerge.js']) copyFileSync(join(repo, 'app', 'js', f), join(out, f));
console.log('Copied shared modules to functions/shared');
