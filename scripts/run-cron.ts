/**
 * Runs the daily expiry sweep without a server, exactly as Vercel Cron would.
 *
 *   npm run cron:local              -- sweep as of today
 *   npm run cron:local -- 2026-12-01 -- sweep as if it were that date
 */
import "./env";
import { runDailySweep } from "@/lib/sweep";
import { isValidDate } from "@/lib/dates";

const asOf = process.argv[2];
if (asOf && !isValidDate(asOf)) {
  console.error(`"${asOf}" is not a YYYY-MM-DD date.`);
  process.exit(1);
}

const result = await runDailySweep(asOf);
console.log(JSON.stringify(result, null, 2));
process.exit(result.errors.length > 0 ? 1 : 0);
