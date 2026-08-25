import type { Config } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit runs outside Next.js, which is what loads .env.local for everything
// else — without this, the documented `npm run db:migrate` sees no DATABASE_URL.
config({ path: [".env.local", ".env"], quiet: true });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} satisfies Config;
