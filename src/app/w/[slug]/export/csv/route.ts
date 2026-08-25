import { requireWorkspace } from "@/lib/workspace";
import { listExceptions } from "@/lib/exceptions";
import { buildExportCsv, exportFilename } from "@/lib/export";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const rows = await listExceptions(workspace.id);

  return new Response(buildExportCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(workspace, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
}
