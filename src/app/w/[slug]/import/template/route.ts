import { toCsv } from "@/lib/csv";
import { IMPORT_TEMPLATE_HEADERS, IMPORT_TEMPLATE_ROWS } from "@/lib/import";

export const dynamic = "force-static";

export function GET() {
  return new Response(toCsv([IMPORT_TEMPLATE_HEADERS, ...IMPORT_TEMPLATE_ROWS]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lapse-import-template.csv"',
    },
  });
}
