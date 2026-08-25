/**
 * Which reminder, if any, an exception has earned today.
 *
 * Milestones are "days remaining" thresholds: the configured lead times, plus 0
 * (expiry day), plus a rolling -7/-14/-21 sweep so an expired-but-open exception
 * keeps nagging instead of going quiet exactly when it matters most.
 *
 * Each milestone fires at most once per exception (enforced by nag_log), and a
 * cron run that missed days collapses the backlog into one message at the most
 * urgent milestone rather than emailing the owner three times.
 */
export const OVERDUE_REPEAT_DAYS = 7;

export type NagDecision = {
  /** Milestone to report in the message; 0 = expiry day, negative = overdue. */
  send: number;
  /** Every milestone this run consumes, including skipped-over ones. */
  consume: number[];
};

export function milestones(leadDays: readonly number[]): number[] {
  const set = new Set<number>([0]);
  for (const d of leadDays) if (Number.isInteger(d) && d > 0) set.add(d);
  return [...set].sort((a, b) => b - a);
}

export function decideNag(
  daysUntilExpiry: number,
  leadDays: readonly number[],
  alreadySent: readonly number[],
): NagDecision | null {
  const sent = new Set(alreadySent);
  const reached = milestones(leadDays).filter((m) => daysUntilExpiry <= m);

  if (daysUntilExpiry < 0) {
    const overdueBy = -daysUntilExpiry;
    const sweeps = Math.floor(overdueBy / OVERDUE_REPEAT_DAYS);
    for (let i = 1; i <= sweeps; i++) reached.push(-i * OVERDUE_REPEAT_DAYS);
  }

  const unsent = reached.filter((m) => !sent.has(m)).sort((a, b) => a - b);
  if (unsent.length === 0) return null;
  return { send: unsent[0], consume: unsent };
}

export function nagSubject(title: string, daysUntilExpiry: number): string {
  if (daysUntilExpiry < 0) {
    return `[OVERDUE] "${title}" expired ${-daysUntilExpiry} day${daysUntilExpiry === -1 ? "" : "s"} ago`;
  }
  if (daysUntilExpiry === 0) return `[Expires today] "${title}"`;
  return `[Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}] "${title}"`;
}
