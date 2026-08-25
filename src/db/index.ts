import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local, then either point it at " +
      "Neon/Supabase or run `npm run db:local` for an embedded Postgres.",
  );
}

// One connection per process: serverless functions should not hold a pool open,
// and the local PGlite socket server serves a single client at a time.
const globalForDb = globalThis as unknown as { __lapseSql?: postgres.Sql };
const client = globalForDb.__lapseSql ?? postgres(url, { max: 1, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__lapseSql = client;

export const db = drizzle(client, { schema });
export { schema };
