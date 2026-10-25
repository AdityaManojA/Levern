// The server's copy of the TaskFlow data: one JSON file (default .data/taskflow.json, outside the
// public app folder). Every change goes through mutate(), which saves, bumps the revision and tells the
// open apps (server-sent events).
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function openDb(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'taskflow.json');
  const empty = () => ({ rev: 0, quests: [], tombstones: [], history: [], historyUpdatedAt: 0, sessions: [], sessionsUpdatedAt: 0, settings: {}, settingsUpdatedAt: 0,
  });
  let doc = empty();
  if (existsSync(file)) { try { doc = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) }; } catch (e) { console.error('TaskFlow: data file unreadable, starting empty', e.message); } }
  const listeners = new Set();
  let saveT = null;
  function saveNow() { clearTimeout(saveT); saveT = null; const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(doc)); renameSync(tmp, file); }
  const save = () => { if (!saveT) saveT = setTimeout(saveNow, 150); };

  return {
    get doc() { return doc; },
    file,
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    // fn(doc) changes the data; returns its result. source: 'app' | 'server'
    mutate(fn, source = 'server') {
      const result = fn(doc);
      doc.rev++;
      save();
      listeners.forEach(f => f({ rev: doc.rev, source }));
      return result;
    },
    flush: saveNow,
  };
}
