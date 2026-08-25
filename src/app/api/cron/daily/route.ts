import { runDailySweep } from "@/lib/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily expiry sweep. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`;
 * locally, `npm run cron:local` does the same.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailySweep();
  return Response.json(result, { status: result.errors.length > 0 ? 207 : 200 });
}
