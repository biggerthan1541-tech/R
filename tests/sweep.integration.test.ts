import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { addDays, today } from "@/lib/dates";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Exercises the daily cron against a real Postgres. Runs when DATABASE_URL is
 * set (`npm run db:local` gives you one); skipped otherwise so the unit suite
 * stays runnable anywhere.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("runDailySweep", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let runDailySweep: typeof import("@/lib/sweep").runDailySweep;
  let eq: typeof import("drizzle-orm").eq;
  let workspaceId: string;
  let exceptionId: string;

  const NOW = today();

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    ({ runDailySweep } = await import("@/lib/sweep"));
    ({ eq } = await import("drizzle-orm"));

    const [ws] = await db
      .insert(schema.workspaces)
      .values({ name: "Sweep Test", slug: `sweep-test-${crypto.randomUUID().slice(0, 8)}` })
      .returning();
    workspaceId = ws.id;

    const [ex] = await db
      .insert(schema.exceptions)
      .values({
        workspaceId,
        title: "Sweep test exception",
        type: "firewall_exception",
        riskLevel: "high",
        riskOwnerName: "Dana Whitfield",
        riskOwnerEmail: "dana@example.com",
        approverName: "Priya Raman",
        approverEmail: "priya@example.com",
        expiryDate: addDays(NOW, 40),
      })
      .returning();
    exceptionId = ex.id;
  });

  afterAll(async () => {
    if (workspaceId) {
      await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    }
  });

  const load = async () => {
    const [row] = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.id, exceptionId));
    return row;
  };

  const eventsOf = async (kind: (typeof schema.eventKindEnum.enumValues)[number]) => {
    const rows = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.exceptionId, exceptionId));
    return rows.filter((e) => e.kind === kind);
  };

  const nags = async () =>
    db.select().from(schema.nagLog).where(eq(schema.nagLog.exceptionId, exceptionId));

  it("leaves a far-off exception alone", async () => {
    await runDailySweep(NOW, workspaceId);
    expect((await load()).status).toBe("open");
    expect(await nags()).toHaveLength(0);
  });

  it("flips open → expiring and nags at the first lead time", async () => {
    await runDailySweep(addDays(NOW, 26), workspaceId); // 14 days before expiry

    expect((await load()).status).toBe("expiring");
    expect(await eventsOf("status_changed")).toHaveLength(1);

    const sent = await nags();
    expect(sent.map((n) => n.leadDays)).toEqual([14]);
    expect(await eventsOf("nag_sent")).toHaveLength(1);
  });

  it("is idempotent — re-running the same day changes nothing", async () => {
    await runDailySweep(addDays(NOW, 26), workspaceId);
    expect(await nags()).toHaveLength(1);
    expect(await eventsOf("nag_sent")).toHaveLength(1);
    expect(await eventsOf("status_changed")).toHaveLength(1);
  });

  it("nags again at each later milestone", async () => {
    await runDailySweep(addDays(NOW, 33), workspaceId); // 7 days out
    await runDailySweep(addDays(NOW, 39), workspaceId); // 1 day out
    await runDailySweep(addDays(NOW, 40), workspaceId); // expiry day

    const sent = await nags();
    expect(sent.map((n) => n.leadDays).sort((a, b) => b - a)).toEqual([14, 7, 1, 0]);
  });

  it("flips to expired and keeps nagging weekly while it stays open", async () => {
    await runDailySweep(addDays(NOW, 41), workspaceId);
    expect((await load()).status).toBe("expired");

    await runDailySweep(addDays(NOW, 44), workspaceId); // 4 days overdue — too soon
    expect((await nags()).some((n) => n.leadDays < 0)).toBe(false);

    await runDailySweep(addDays(NOW, 47), workspaceId); // 7 days overdue
    expect((await nags()).some((n) => n.leadDays === -7)).toBe(true);
  });

  it("re-arms every reminder when the expiry date moves", async () => {
    const { moveExpiry } = await import("@/lib/exceptions");
    await moveExpiry(
      workspaceId,
      exceptionId,
      "renewed",
      addDays(NOW, 130),
      "Reviewed with the risk owner.",
      "tester@example.com",
    );

    expect(await nags()).toHaveLength(0);
    expect(await eventsOf("renewed")).toHaveLength(1);

    const row = await load();
    expect(row.status).toBe("renewed");
    expect(row.expiryDate).toBe(addDays(NOW, 130));
  });

  it("stops nagging once the exception is closed", async () => {
    const { closeException } = await import("@/lib/exceptions");
    await closeException(workspaceId, exceptionId, "Firewall rule removed.", "tester@example.com");

    const result = await runDailySweep(addDays(NOW, 200), workspaceId);
    expect(result.errors).toEqual([]);
    expect(await nags()).toHaveLength(0);

    const row = await load();
    expect(row.status).toBe("closed");
    expect(row.closedAt).not.toBeNull();
  });
});
