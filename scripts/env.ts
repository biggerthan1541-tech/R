import { config } from "dotenv";

// Next.js loads .env.local automatically; standalone scripts have to ask.
config({ path: [".env.local", ".env"], quiet: true });
