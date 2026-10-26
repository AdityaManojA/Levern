// A person's Levern data is one JSON document (the same shape the app syncs). Sketches can make it
// big, and a Firestore document holds at most 1 MiB, so it is stored deflated and split into chunks.
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const CHUNK = 900 * 1024;

export function pack(doc) {
  const bytes = deflateRawSync(Buffer.from(JSON.stringify(doc)), { level: 6 });
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK) chunks.push(bytes.subarray(i, i + CHUNK));
  return chunks.length ? chunks : [Buffer.alloc(0)];
}

export function unpack(chunks) {
  const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));
  if (!buf.length) return null;
  return JSON.parse(inflateRawSync(buf).toString('utf8'));
}
