import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { events, exceptions, nagLog } from "@/db/schema";
import type { EventKind, Exception, NewException } from "@/db/schema";
import type { ExceptionWithEvents } from "./export";

export async function listExceptions(workspaceId: string): Promise<ExceptionWithEvents[]> {
  const rows = await db
    .select()
    .from(exceptions)
    .where(eq(exceptions.workspaceId, workspaceId))
    .orderBy(asc(exceptions.expiryDate));

  if (rows.length === 0) return [];

  const history = await db
    .select()
    .from(events)
    .where(
      inArray(
        events.exceptionId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(events.timestamp));

  const byException = new Map<string, typeof history>();
  for (const e of history) {
    const list = byException.get(e.exceptionId);
    if (list) list.push(e);
    else byException.set(e.exceptionId, [e]);
  }

  return rows.map((r) => ({ ...r, events: byException.get(r.id) ?? [] }));
}

export async function getException(
  workspaceId: string,
  id: string,
): Promise<ExceptionWithEvents | null> {
  const [row] = await db
    .select()
    .from(exceptions)
    .where(and(eq(exceptions.workspaceId, workspaceId), eq(exceptions.id, id)))
    .limit(1);
  if (!row) return null;

  const history = await db
    .select()
    .from(events)
    .where(eq(events.exceptionId, id))
    .orderBy(desc(events.timestamp));

  return { ...row, events: history };
}

export async function recordEvent(input: {
  workspaceId: string;
  exceptionId: string;
  kind: EventKind;
  note?: string;
  actor: string;
  timestamp?: Date;
}) {
  await db.insert(events).values({
    workspaceId: input.workspaceId,
    exceptionId: input.exceptionId,
    kind: input.kind,
    note: input.note ?? "",
    actor: input.actor,
    ...(input.timestamp ? { timestamp: input.timestamp } : {}),
  });
}

export async function createException(
  values: NewException,
  actor: string,
  kind: EventKind = "created",
  note = "",
): Promise<Exception> {
  const [row] = await db.insert(exceptions).values(values).returning();
  await recordEvent({
    workspaceId: row.workspaceId,
    exceptionId: row.id,
    kind,
    note,
    actor,
  });
  return row;
}

export async function updateException(
  workspaceId: string,
  id: string,
  values: Partial<NewException>,
  actor: string,
  note: string,
): Promise<Exception | null> {
  const [row] = await db
    .update(exceptions)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(exceptions.workspaceId, workspaceId), eq(exceptions.id, id)))
    .returning();
  if (!row) return null;
  await recordEvent({ workspaceId, exceptionId: id, kind: "updated", note, actor });
  return row;
}

/** Renew or extend: both move the expiry date out and demand a written reason. */
export async function moveExpiry(
  workspaceId: string,
  id: string,
  kind: "renewed" | "extended",
  newExpiry: string,
  reason: string,
  actor: string,
): Promise<Exception | null> {
  const [row] = await db
    .update(exceptions)
    .set({
      expiryDate: newExpiry,
      status: "renewed",
      closedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(exceptions.workspaceId, workspaceId), eq(exceptions.id, id)))
    .returning();
  if (!row) return null;

  await recordEvent({
    workspaceId,
    exceptionId: id,
    kind,
    note: `New expiry ${newExpiry}. ${reason}`,
    actor,
  });
  await clearNagLog(id);
  return row;
}

export async function closeException(
  workspaceId: string,
  id: string,
  reason: string,
  actor: string,
): Promise<Exception | null> {
  const [row] = await db
    .update(exceptions)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(exceptions.workspaceId, workspaceId), eq(exceptions.id, id)))
    .returning();
  if (!row) return null;
  await recordEvent({ workspaceId, exceptionId: id, kind: "closed", note: reason, actor });
  return row;
}

export async function reopenException(
  workspaceId: string,
  id: string,
  reason: string,
  actor: string,
): Promise<Exception | null> {
  const [row] = await db
    .update(exceptions)
    .set({ status: "open", closedAt: null, updatedAt: new Date() })
    .where(and(eq(exceptions.workspaceId, workspaceId), eq(exceptions.id, id)))
    .returning();
  if (!row) return null;
  await recordEvent({ workspaceId, exceptionId: id, kind: "reopened", note: reason, actor });
  await clearNagLog(id);
  return row;
}

/** A moved expiry date re-arms every reminder milestone for this exception. */
async function clearNagLog(exceptionId: string) {
  await db.delete(nagLog).where(eq(nagLog.exceptionId, exceptionId));
}
