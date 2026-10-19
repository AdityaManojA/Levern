// Copies Mochi v2's art into the web app (read-only use of the design files).
// The source of truth is design/mochi/v2 (cut and built by design/mochi/v2/build.py, owned by the
// Mochi animation work). Re-run this after the frames are re-cut:
//
//   node scripts/sync-mochi.mjs [path/to/design]     (default: ./design)
//
// Writes app/mochi/manifest.js (sizes, body axis, ground line, fps, loops per animation) and
// app/mochi/strips/<name>.png (each animation's frames side by side, at 2x).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(process.argv[2] || join(repo, 'design'));
const js = join(design, 'prototype', 'mochi-v2.js'), strips = join(design, 'mochi', 'v2', 'out', 'strips');
if (!existsSync(js) || !existsSync(strips)) { console.error(`No Mochi v2 build in ${design} (need prototype/mochi-v2.js and mochi/v2/out/strips).`); process.exit(1); }

const src = readFileSync(js, 'utf8');
const data = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
data.base = 'mochi/';
const out = join(repo, 'app', 'mochi');
rmSync(join(out, 'strips'), { recursive: true, force: true });
mkdirSync(join(out, 'strips'), { recursive: true });
let n = 0;
for (const name of Object.keys(data.anims)) {
  const f = join(strips, name + '.png');
  if (!existsSync(f)) { console.warn('missing strip', name); delete data.anims[name]; continue; }
  copyFileSync(f, join(out, 'strips', name + '.png')); n++;
}
writeFileSync(join(out, 'manifest.js'), `// Mochi v2 manifest, copied from design/prototype/mochi-v2.js by scripts/sync-mochi.mjs. Do not edit by hand.
// Every frame of an animation shares one canvas: his body centre is at ax, his paws at gy (display px).
export default ${JSON.stringify(data)};
`);
console.log(`Mochi: ${n} animations copied from ${design}`);
const extra = readdirSync(strips).filter(f => !data.anims[f.replace('.png', '')]);
if (extra.length) console.log('not in the manifest (skipped):', extra.join(', '));
