// Reminders that come back through the day: either every N hours inside a window ({ every, from, to }),
// or at set clock times ({ times: ['18:00', '19:00'] }). nextMultiAt gives the next moment after `afterMs`.
import { todayStr, addDays, at } from './dates.js';

export function nextMultiAt(m, afterMs = Date.now()) {
  const d0 = todayStr(new Date(afterMs)), out = [];
  for (const day of [d0, addDays(d0, 1)]) {
    if (m.times?.length) for (const t of m.times) out.push(at(day, t));
    else {
      const end = at(day, m.to);
      for (let t = at(day, m.from); t <= end; t += m.every * 3600000) out.push(t);
    }
  }
  return out.filter(t => t > afterMs).sort((a, b) => a - b)[0] ?? null;
}

// "every 2 h, 09:00–21:00" or "at 18:00, 19:00"
export const multiLabel = m => m.times?.length ? `at ${m.times.join(', ')}` : `every ${m.every} h, ${m.from}–${m.to}`;
