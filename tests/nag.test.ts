import { describe, expect, it } from "vitest";
import { decideNag, milestones, nagSubject, OVERDUE_REPEAT_DAYS } from "@/lib/nag";

const LEADS = [14, 7, 1];

describe("milestones", () => {
  it("always includes expiry day and sorts descending", () => {
    expect(milestones(LEADS)).toEqual([14, 7, 1, 0]);
  });

  it("de-duplicates and drops non-positive or non-integer lead times", () => {
    expect(milestones([7, 7, 0, -3, 2.5, 1])).toEqual([7, 1, 0]);
  });

  it("still nags on the expiry day when no lead times are configured", () => {
    expect(milestones([])).toEqual([0]);
  });
});

describe("decideNag", () => {
  it("stays silent before the first milestone", () => {
    expect(decideNag(30, LEADS, [])).toBeNull();
    expect(decideNag(15, LEADS, [])).toBeNull();
  });

  it("fires each milestone as it is reached", () => {
    expect(decideNag(14, LEADS, [])).toEqual({ send: 14, consume: [14] });
    expect(decideNag(7, LEADS, [14])).toEqual({ send: 7, consume: [7] });
    expect(decideNag(1, LEADS, [14, 7])).toEqual({ send: 1, consume: [1] });
    expect(decideNag(0, LEADS, [14, 7, 1])).toEqual({ send: 0, consume: [0] });
  });

  it("fires the milestone that has been passed, not the one matched exactly", () => {
    expect(decideNag(10, LEADS, [])).toEqual({ send: 14, consume: [14] });
    expect(decideNag(2, LEADS, [14])).toEqual({ send: 7, consume: [7] });
  });

  it("stays quiet between milestones", () => {
    // Four days out, with 14 and 7 already sent: the next nag is due at 1 day.
    expect(decideNag(4, LEADS, [14, 7])).toBeNull();
  });

  it("collapses a missed-run backlog into a single message at the most urgent milestone", () => {
    // The cron did not run for two weeks: send one email, burn every milestone.
    expect(decideNag(1, LEADS, [])).toEqual({ send: 1, consume: [1, 7, 14] });
  });

  it("is idempotent — a second run on the same day sends nothing", () => {
    const first = decideNag(7, LEADS, [14]);
    expect(first).not.toBeNull();
    expect(decideNag(7, LEADS, [14, ...first!.consume])).toBeNull();
  });

  it("re-nags weekly while expired and still open", () => {
    const sent = [14, 7, 1, 0];
    expect(decideNag(-1, LEADS, sent)).toBeNull();
    expect(decideNag(-6, LEADS, sent)).toBeNull();
    expect(decideNag(-7, LEADS, sent)).toEqual({ send: -7, consume: [-7] });
    expect(decideNag(-8, LEADS, sent)).toEqual({ send: -7, consume: [-7] });
    expect(decideNag(-14, LEADS, [...sent, -7])).toEqual({ send: -14, consume: [-14] });
    expect(OVERDUE_REPEAT_DAYS).toBe(7);
  });

  it("does not resend an overdue sweep already logged", () => {
    expect(decideNag(-9, LEADS, [14, 7, 1, 0, -7])).toBeNull();
  });

  it("catches up an exception imported already overdue", () => {
    const decision = decideNag(-20, LEADS, []);
    expect(decision).toEqual({ send: -14, consume: [-14, -7, 0, 1, 7, 14] });
  });

  it("honours a custom lead-time configuration", () => {
    expect(decideNag(30, [30], [])).toEqual({ send: 30, consume: [30] });
    expect(decideNag(20, [30], [30])).toBeNull();
  });
});

describe("nagSubject", () => {
  it("escalates its tone as the date passes", () => {
    expect(nagSubject("SFTP rule", 14)).toBe('[Expires in 14 days] "SFTP rule"');
    expect(nagSubject("SFTP rule", 1)).toBe('[Expires in 1 day] "SFTP rule"');
    expect(nagSubject("SFTP rule", 0)).toBe('[Expires today] "SFTP rule"');
    expect(nagSubject("SFTP rule", -1)).toBe('[OVERDUE] "SFTP rule" expired 1 day ago');
    expect(nagSubject("SFTP rule", -31)).toBe('[OVERDUE] "SFTP rule" expired 31 days ago');
  });
});
