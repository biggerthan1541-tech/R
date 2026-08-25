/**
 * Local Postgres for development, with no Docker and no cloud account.
 *
 * Runs PGlite (Postgres compiled to WASM) behind a real Postgres wire-protocol
 * socket, so the app, drizzle-kit and the seed script all talk to it through an
 * ordinary DATABASE_URL and stay completely unaware it isn't Neon.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.LOCAL_DB_PORT ?? 5432);
const dataDir = process.env.LOCAL_DB_DIR ?? "./.pglite";

const db = await PGlite.create({ dataDir });
// PGlite is single-connection; the server multiplexes so the dev server, the
// seed script and the test suite can all be pointed at it at once.
const server = new PGLiteSocketServer({
  db,
  port,
  host: "127.0.0.1",
  maxConnections: Number(process.env.LOCAL_DB_MAX_CONNECTIONS ?? 20),
});
await server.start();

console.log(`PGlite listening on postgres://postgres@127.0.0.1:${port}/postgres (${dataDir})`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
