/** Most recent occurrence of (dayOfWeek, hourUtc) at or before `now` (UTC). */
export function lastLotteryDrawUtc(dayOfWeek: number, hourUtc: number, now: Date): Date {
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0));
  for (let i = 0; i < 8; i++) {
    const d = new Date(candidate.getTime() - i * 24 * 60 * 60 * 1000);
    if (d.getUTCDay() === dayOfWeek && d.getTime() <= now.getTime()) {
      return d;
    }
  }
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/** Next scheduled lottery draw strictly after `now` (UTC). */
export function nextLotteryDrawUtc(dayOfWeek: number, hourUtc: number, now: Date): Date {
  const last = lastLotteryDrawUtc(dayOfWeek, hourUtc, now);
  const next = new Date(last.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (next.getTime() <= now.getTime()) {
    return new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return next;
}
