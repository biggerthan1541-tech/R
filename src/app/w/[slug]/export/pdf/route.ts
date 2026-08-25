import { requireWorkspace } from "@/lib/workspace";
import { listExceptions } from "@/lib/exceptions";
import { exportFilename } from "@/lib/export";
import { buildRegisterPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { workspace, user } = await requireWorkspace(slug);
  const rows = await listExceptions(workspace.id);

  const pdf = await buildRegisterPdf({
    workspace,
    rows,
    generatedBy: user.name ? `${user.name} <${user.email}>` : user.email,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${exportFilename(workspace, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
