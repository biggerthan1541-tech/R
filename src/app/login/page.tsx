import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Wordmark } from "@/components/wordmark";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  async function sendLink(formData: FormData) {
    "use server";
    await signIn("resend", {
      email: String(formData.get("email") ?? "")
        .trim()
        .toLowerCase(),
      redirectTo: "/",
    });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_480px]">
      <section className="rule-r hidden flex-col justify-between px-12 py-10 lg:flex">
        <Wordmark eyebrow="Exception register" />
        <div>
          <h1 className="max-w-[14ch] text-[64px] leading-[0.94] tracking-[-0.03em]">
            The spreadsheet
            <br />
            <span className="text-accent">rots.</span>
          </h1>
          <p className="mt-6 max-w-[46ch] text-[15px] text-neutral-800">
            Every firewall exception, risk acceptance and temporary access grant — with a named
            owner, a hard expiry date and an event history nobody can quietly edit. It nags the
            owner before expiry and prints auditor-ready evidence on demand.
          </p>
          <div className="mt-8 grid max-w-[46ch] grid-cols-3 border border-[var(--divider)]">
            {[
              ["Expire", "Every entry ends"],
              ["Nag", "14 / 7 / 1 days out"],
              ["Export", "PDF + CSV, one click"],
            ].map(([title, sub], i) => (
              <div key={title} className={`px-3.5 py-3 ${i > 0 ? "border-l border-[var(--divider)]" : ""}`}>
                <div className="text-[15px] font-extrabold">{title}</div>
                <div className="text-[11px] text-neutral-700">{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-neutral-600">
          Built for SOC 2 and ISO 27001 programmes
        </p>
      </section>

      <section className="flex flex-col justify-center px-8 py-12 sm:px-12">
        <div className="lg:hidden">
          <Wordmark eyebrow="Exception register" />
        </div>
        <h3 className="mt-8 mb-1.5 lg:mt-0">Sign in</h3>
        <p className="mb-6 text-[14px] text-neutral-700">
          We send a one-time link. No password to manage, no SSO to configure.
        </p>

        <form action={sendLink} className="flex max-w-[380px] flex-col gap-3">
          <div>
            <label className="label" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary justify-start">
            Email me a sign-in link
          </button>
        </form>
      </section>
    </main>
  );
}
