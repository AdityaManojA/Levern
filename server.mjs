// TaskFlow local server: serves app/, the REST API (/api/v1, see app/API.md), the app's data sync
// (/sync, this computer only) and a live calendar feed at /calendar.ics.
// The app PUTs the feed whenever quests change; calendar apps subscribe to
// webcal://localhost:5190/calendar.ics (or http://…) and re-fetch it on their own schedule.
//
//   node server.mjs [port]        (npm start)
//   HOST=0.0.0.0 node server.mjs  to let other devices on your network reach it (and the feed)
import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './server/db.mjs';
import { createApi } from './server/api.mjs';
import { createSync } from './server/sync.mjs';
import { createHooks } from './server/webhooks.mjs';

const ROOT = process.env.TASKFLOW_ROOT || join(dirname(fileURLToPath(import.meta.url)), 'app');
const DATA = process.env.TASKFLOW_DATA || join(dirname(fileURLToPath(import.meta.url)), '.data');
const FEED = join(DATA, 'calendar.ics');
const PORT = +(process.argv[2] || process.env.PORT || 5190);
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ics': 'text/calendar; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const EMPTY = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TaskFlow//Quests//EN\r\nX-WR-CALNAME:TaskFlow\r\nEND:VCALENDAR\r\n';
const MAX_FEED = 2 * 1024 * 1024;
// only the app itself (same machine) may replace the feed
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

const db = openDb(DATA);
const hooks = createHooks(db);
const api = createApi(db);
const sync = createSync(db, hooks, PORT);
process.on('SIGINT', () => { db.flush(); process.exit(0); });
process.on('SIGTERM', () => { db.flush(); process.exit(0); });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);
  if (path.startsWith('/api/')) return api(req, res, path);
  if (path.startsWith('/sync/')) return sync(req, res, path);
  try {
    if (path === '/calendar.ics') {
      if (req.method === 'PUT') {
        const origin = req.headers.origin;
        if (!isLocal(req) || (origin && origin !== `http://${req.headers.host}`)) { res.writeHead(403).end(); return; }
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > MAX_FEED) { res.writeHead(413).end(); return; } }
        if (!body.startsWith('BEGIN:VCALENDAR')) { res.writeHead(400).end(); return; }
        await mkdir(DATA, { recursive: true }); await writeFile(FEED, body);
        res.writeHead(204).end(); return;
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const ics = await readFile(FEED, 'utf8').catch(() => EMPTY);
        res.writeHead(200, { 'Content-Type': TYPES['.ics'], 'Cache-Control': 'no-cache', 'Content-Disposition': 'inline; filename="taskflow.ics"' });
        res.end(req.method === 'HEAD' ? undefined : ics); return;
      }
      res.writeHead(405).end(); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let file = normalize(join(ROOT, path));
    // inside the app folder only: the root itself, or a path under it (a bare prefix match would let app-old/ through)
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    // same policy as firebase.json (keep the two in step)
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self'; script-src 'self' https://www.gstatic.com https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; worker-src 'self'; manifest-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://www.gstatic.com https://accounts.google.com https://apis.google.com; frame-src 'self' https://accounts.google.com https://apis.google.com https://*.googleapis.com https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' }).end(e.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
});
server.listen(PORT, HOST, () => console.log(`TaskFlow on http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}  (calendar feed: /calendar.ics)`));
