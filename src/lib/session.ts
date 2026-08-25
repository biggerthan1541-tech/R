import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { mintToken } from "./tokens";
import { appOrigin } from "./urls";

const SESSION_DAYS = 30;

/**
 * Auth.js keeps sessions in the database, so a verified bearer link can sign
 * someone in by writing the same row the magic-link flow writes. Used by the
 * invitation and nag-reminder links.
 */
export async function startSession(userId: string): Promise<void> {
  const sessionToken = mintToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.insert(sessions).values({ sessionToken, userId, expires });

  const secure = appOrigin().startsWith("https://");
  const store = await cookies();
  store.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
}
