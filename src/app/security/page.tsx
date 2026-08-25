import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/wordmark";
import { SUBPROCESSORS, TRUST } from "@/lib/trust";

export const metadata: Metadata = {
  title: "Security — Lapse",
  description:
    "How Lapse is hosted, how data is encrypted in transit and at rest, and how to have your data deleted.",
};

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12">
      <Link href="/">
        <Wordmark eyebrow="Exception register" />
      </Link>

      <h1 className="mt-10 mb-3 text-[42px]">Security</h1>
      <p className="max-w-[62ch] text-[15px] leading-relaxed text-neutral-800">
        Lapse holds a register of your open security exceptions — which is, by definition, a list
        of where your controls currently do not apply. This page states plainly how that data is
        hosted, protected and deleted.
      </p>
      <p className="mt-3 text-[12px] text-neutral-700">Last reviewed {TRUST.lastReviewed}.</p>

      <Section title="Hosting">
        <Fact label="Application">
          Vercel — serverless functions in <Value>{TRUST.appRegion}</Value>. The daily expiry sweep
          runs as a Vercel Cron job against the same deployment.
        </Fact>
        <Fact label="Database">
          Neon — managed Postgres in <Value>{TRUST.databaseRegion}</Value>. One database, one
          logical schema; every row carries a workspace ID.
        </Fact>
        <Fact label="Email">
          Resend delivers sign-in links and expiry reminders. Reminder emails contain the exception
          title, its expiry date and a single-recipient link.
        </Fact>
      </Section>

      <Section title="Encryption">
        <Fact label="In transit">
          TLS 1.2 or higher for all traffic — browser to application, application to database, and
          application to every third party listed below. HTTP is redirected to HTTPS by the host,
          and HSTS is set on the application domain.
        </Fact>
        <Fact label="At rest">
          Database storage and backups are encrypted with AES-256 by Neon. Vercel encrypts
          environment variables and build artefacts at rest. Lapse itself stores no files: there is
          no object storage and no upload bucket. Imported CSVs are parsed in the request and never
          written to disk.
        </Fact>
      </Section>

      <Section title="Access and separation">
        <Fact label="Authentication">
          Email magic link only. No passwords are set, stored or transmitted, so there is no
          password database to breach. Sessions are server-side records in Postgres, referenced by
          an HTTP-only, Secure, SameSite=Lax cookie.
        </Fact>
        <Fact label="Tenancy">
          Every workspace-scoped page and API route resolves the workspace through a single
          membership check. A workspace you are not a member of is indistinguishable from one that
          does not exist.
        </Fact>
        <Fact label="Separation of duties">
          Whoever logs an exception cannot sign off on it. Renewing, extending, closing and
          reopening require an approver or admin who is not the author, and every one of those
          actions demands a written reason and appends an immutable event to the record.
        </Fact>
        <Fact label="Reminder links">
          Expiry reminders contain a per-recipient link that signs the recipient in and grants them
          access to that one workspace. These links carry 256 bits of entropy, are addressed to a
          single mailbox, and expire after 45 days. They are the same class of secret as a sign-in
          link — treat a forwarded reminder as you would a forwarded password reset.
        </Fact>
      </Section>

      <Section title="Data handling">
        <Fact label="What is stored">
          Exception records and their event history, workspace membership, and the email addresses
          and names of members, risk owners and approvers. Lapse does not ask for and does not
          store credentials, cardholder data, health records, or any customer data of yours beyond
          what you type into an exception.
        </Fact>
        <Fact label="Retention">
          Records are kept for as long as the workspace exists. The event log is append-only by
          design — closing an exception never deletes its history, because that history is the
          evidence.
        </Fact>
        <Fact label="Deletion on request">
          Email <Value>{TRUST.contactEmail}</Value> from an address that owns the workspace and we
          will delete it, and everything in it, within 30 days. Deletion cascades: exceptions,
          events, reminder logs, invitations and memberships all go with the workspace. Encrypted
          database backups roll off on their own schedule within 30 days of deletion. You can also
          export the complete register as PDF and CSV first — one click, from the register itself.
        </Fact>
        <Fact label="Portability">
          Everything you put in is exportable at any time, without asking us: the CSV export
          contains every field and the full event history for every exception.
        </Fact>
      </Section>

      <Section title="Sub-processors">
        <div className="hair overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th className="pl-4">Provider</th>
                <th>Purpose</th>
                <th className="pr-4">Data reached</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name}>
                  <td className="pl-4 font-semibold">{s.name}</td>
                  <td className="text-[13px] text-neutral-800">{s.purpose}</td>
                  <td className="pr-4 text-[13px] text-neutral-800">{s.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Reporting a vulnerability">
        <Fact label="Contact">
          Email <Value>{TRUST.contactEmail}</Value>. Please include enough detail to reproduce the
          issue. We will acknowledge within two business days and will not pursue action against
          good-faith research that avoids privacy violations and service degradation.
        </Fact>
      </Section>

      <p className="mt-12 max-w-[62ch] border-t-2 border-[var(--divider)] pt-5 text-[12px] leading-relaxed text-neutral-700">
        This page describes how the product is built and operated. It is not a certification: Lapse
        does not hold a SOC 2 or ISO 27001 report of its own, and does not claim one. If your
        procurement process needs something this page does not answer, email{" "}
        {TRUST.contactEmail} and ask.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-[25px]">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[150px_1fr]">
      <div className="kicker pt-1">{label}</div>
      <p className="m-0 max-w-[58ch] text-[14px] leading-relaxed text-neutral-800">{children}</p>
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-ink">{children}</span>;
}
