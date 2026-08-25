"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { events, exceptions } from "@/db/schema";
import { requireWorkspace } from "@/lib/workspace";
import { parseCsv } from "@/lib/csv";
import { parseRow, type ColumnMapping } from "@/lib/import";

export type ImportState = {
  error?: string;
  result?: { imported: number; skipped: number; problems: Array<{ row: number; errors: string[] }> };
};

const MAX_ROWS = 5000;

export async function importAction(
  slug: string,
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { workspace, user } = await requireWorkspace(slug);

  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "No CSV content was submitted." };

  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}"));
  } catch {
    return { error: "Column mapping was malformed." };
  }

  const rows = parseCsv(csv);
  const body = rows.slice(1);
  if (body.length === 0) return { error: "The file has a header row but no data rows." };
  if (body.length > MAX_ROWS) {
    return { error: `That file has ${body.length} rows; the import limit is ${MAX_ROWS}.` };
  }

  const parsed = body.map((cells, i) => parseRow(cells, mapping, i + 2));
  const good = parsed.filter((r) => r.ok);
  const problems = parsed
    .filter((r): r is Extract<typeof r, { ok: false }> => !r.ok)
    .map(({ row, errors }) => ({ row, errors }));

  if (good.length > 0) {
    // All-or-nothing: a half-imported register is worse than none.
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(exceptions)
        .values(
          good.map((r) => ({
            ...r.value,
            workspaceId: workspace.id,
            status: "open" as const,
          })),
        )
        .returning({ id: exceptions.id });

      await tx.insert(events).values(
        inserted.map((row) => ({
          workspaceId: workspace.id,
          exceptionId: row.id,
          kind: "imported" as const,
          note: "Imported from CSV.",
          actor: user.email,
        })),
      );
    });
  }

  revalidatePath(`/w/${slug}`);
  return { result: { imported: good.length, skipped: problems.length, problems } };
}
