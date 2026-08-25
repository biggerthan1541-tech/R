import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { isDryRun } from "@/lib/notify";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: { signIn: "/login", verifyRequest: "/login/check-email" },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY ?? "dry-run",
      from: process.env.RESEND_FROM ?? "Lapse <onboarding@resend.dev>",
      async sendVerificationRequest(params) {
        if (isDryRun()) {
          // Local development without a Resend key: the link goes to the terminal.
          console.log(`\n  Sign-in link for ${params.identifier}:\n  ${params.url}\n`);
          return;
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: params.provider.from,
            to: params.identifier,
            subject: "Sign in to Lapse",
            html: signInEmail(params.url),
            text: `Sign in to Lapse: ${params.url}`,
          }),
        });
        if (!res.ok) throw new Error(`Resend rejected the sign-in email: ${await res.text()}`);
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});

function signInEmail(url: string): string {
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111827">
  <p style="font-size:20px;font-weight:700;margin:0 0 24px">Lapse</p>
  <p style="margin:0 0 24px;line-height:1.6">Click below to sign in to your exception register. This link expires in 24 hours.</p>
  <p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Sign in to Lapse</a></p>
  <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6">If you did not request this, you can ignore this email.</p>
</div>`;
}
