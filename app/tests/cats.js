import MOCHI from '../mochi/manifest.js';
import COOKIE from '../cookie/manifest.js';
const CATS = { mochi: MOCHI, cookie: COOKIE };
const MOVES = new Set(['walk', 'sprint', 'sprint-stop', 'get-up-left', 'get-up-right']);
let appTempo = false, timers = [];
const tempo = n => !appTempo ? 1 : MOVES.has(n) ? 1.15 : n === 'rest' || n === 'sleep' ? 0.75 : 0.3;

// every strip: right pixel size for its frames, no empty frames, loops inside the frame count
async function check(cat) {
  const V = CATS[cat], out = {};
  for (const [n, a] of Object.entries(V.anims)) {
    const errs = [];
    let img;
    try { img = await createImageBitmap(await (await fetch('../' + V.base + 'strips/' + n + '.' + (V.ext || 'png'))).blob()); }
    catch (e) { out[n] = ['strip missing']; continue; }
    img.naturalWidth = img.width; img.naturalHeight = img.height;
    const k = V.scale || 3, W = Math.round(a.w * a.frames * k), H = Math.round(a.h * k);
    if (Math.abs(img.naturalWidth - W) > 1 || Math.abs(img.naturalHeight - H) > 1) errs.push(`size ${img.naturalWidth}x${img.naturalHeight}, expected ${W}x${H}`);
    if (!(a.fps > 0)) errs.push('no fps');
    if (a.loop && (a.loop[0] < 1 || a.loop[1] > a.frames || a.loop[0] > a.loop[1])) errs.push('loop ' + a.loop);
    if (a.hold && a.hold > a.frames) errs.push('hold ' + a.hold);
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const fw = img.naturalWidth / a.frames;
    for (let f = 0; f < a.frames; f++) {
      const d = g.getImageData(Math.round(f * fw), 0, Math.max(1, Math.round(fw)), img.naturalHeight).data;
      let solid = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) solid++;
      if (solid < 200) errs.push(`frame ${f + 1} empty`);
    }
    out[n] = errs;
  }
  return out;
}

function show(cat, results) {
  timers.forEach(clearInterval); timers = [];
  const V = CATS[cat], g = document.getElementById('g'); g.innerHTML = '';
  for (const [n, a] of Object.entries(V.anims)) {
    const c = document.createElement('div'); c.className = 'c' + (results[n]?.length ? ' err' : '');
    c.innerHTML = `<div class="stage"><div class="s"></div></div><div class="n">${n}</div><div class="m">${a.frames} frames · ${a.fps} fps${a.loop ? ' · loop ' + a.loop.join('–') : ''}${a.face === 'R' ? ' · side-on' : ''}</div>${results[n]?.length ? `<div class="m bad">${results[n].join('<br>')}</div>` : ''}`;
    g.append(c);
    const s = c.querySelector('.s');
    s.style.width = a.w + 'px'; s.style.height = a.h + 'px';
    s.style.backgroundImage = `url("../${V.base}strips/${n}.${V.ext || 'png'}")`;
    s.style.backgroundSize = `${a.w * a.frames}px ${a.h}px`;
    // the stage floor is his ground line
    s.style.marginBottom = -(a.h - a.gy) + 'px';
    let i = 1;
    timers.push(setInterval(() => { i = i >= a.frames ? 1 : i + 1; s.style.backgroundPosition = `${-(i - 1) * a.w}px 0`; }, 1000 / (a.fps * tempo(n))));
  }
}

const results = { mochi: await check('mochi'), cookie: await check('cookie') };
const bad = cat => Object.entries(results[cat]).filter(([, e]) => e.length);
const line = cat => { const b = bad(cat); return `${cat}: ${Object.keys(results[cat]).length} animations, ${b.length ? `<span class="bad">${b.length} with problems</span>` : '<span class="good">all fine</span>'}`; };
document.getElementById('sum').innerHTML = line('mochi') + ' · ' + line('cookie');
window.__report = { mochi: Object.fromEntries(bad('mochi')), cookie: Object.fromEntries(bad('cookie')), counts: { mochi: Object.keys(results.mochi).length, cookie: Object.keys(results.cookie).length } };
let cur = 'mochi';
show(cur, results[cur]);
document.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { cur = b.dataset.cat; document.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === b)); show(cur, results[cur]); });
document.getElementById('dark').onclick = e => { document.body.classList.toggle('dark'); e.target.classList.toggle('on'); };
document.getElementById('tempo').onclick = e => { appTempo = !appTempo; e.target.classList.toggle('on'); show(cur, results[cur]); };
