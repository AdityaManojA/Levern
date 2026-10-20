// Weekly goals: a quest like "Gym, 3 times a week" has no day. Every completion is logged with its time, and
// the week runs Monday to Sunday (local time). The goal is the minimum; going past it is recorded as extra.
export const GOAL_MIN = 1, GOAL_MAX = 14, GOAL_DEFAULT = 3;

export const clampGoal = n => { const v = Math.round(+n); return Number.isFinite(v) ? Math.max(GOAL_MIN, Math.min(GOAL_MAX, v)) : GOAL_DEFAULT; };

// the Monday 00:00 that starts the week containing `ms`
export function weekStart(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// how a goal quest stands this week: the count so far, whether the minimum is met, and any extra
export function goalProgress(q, now = Date.now()) {
  const start = weekStart(now), end = new Date(start);
  end.setDate(end.getDate() + 7);
  const log = q.goal?.log || [];
  const count = log.filter(t => t >= start && t < end.getTime()).length;
  const target = q.goal?.target || GOAL_DEFAULT;
  return { count, target, met: count >= target, extra: Math.max(0, count - target) };
}
