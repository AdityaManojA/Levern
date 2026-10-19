// TaskFlow local server: serves app/ and keeps a live calendar feed at /calendar.ics.
// The app PUTs the feed whenever quests change; calendar apps subscribe to
// webcal://localhost:5190/calendar.ics (or http://…) and re-fetch it on their own schedule.
//
//   node server.mjs [port]        (npm start)
//   HOST=0.0.0.0 node server.mjs  to let other devices on your network reach it (and the feed)
import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.TASKFLOW_ROOT || join(dirname(fileURLToPath(import.meta.url)), 'app');
const DATA = process.env.TASKFLOW_DATA || join(dirname(fileURLToPath(import.meta.url)), '.data');
const FEED = join(DATA, 'calendar.ics');
const PORT = +(process.argv[2] || process.env.PORT || 5190);
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ics': 'text/calendar; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const EMPTY = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TaskFlow//Quests//EN\r\nX-WR-CALNAME:TaskFlow\r\nEND:VCALENDAR\r\n';
const MAX_FEED = 2 * 1024 * 1024;
// only the app itself (same machine) may replace the feed
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);
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
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' }).end(e.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
});
server.listen(PORT, HOST, () => console.log(`TaskFlow on http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}  (calendar feed: /calendar.ics)`));
