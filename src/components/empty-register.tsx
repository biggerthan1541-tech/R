import Link from "next/link";

/**
 * What a brand-new workspace looks like. A blank table teaches nothing, so this
 * is the onboarding: the three things worth doing, in the order worth doing them.
 */
export function EmptyRegister({ slug, workspaceName }: { slug: string; workspaceName: string }) {
  const steps = [
    {
      n: "01",
      title: "Bring your spreadsheet",
      body: "Upload the CSV you keep today. Lapse maps your columns to owners, expiry dates and compensating controls, and shows you the parse before writing anything.",
      cta: { href: `/w/${slug}/import`, label: "Import CSV", primary: true },
    },
    {
      n: "02",
      title: "Or log one by hand",
      body: "Eleven fields, one of them non-negotiable: the expiry date. Everything you record here lands in the auditor export.",
      cta: { href: `/w/${slug}/exceptions/new`, label: "New exception", primary: false },
    },
    {
      n: "03",
      title: "Add the people who sign off",
      body: "Invite your approvers. Whoever logs an exception can never sign off on it themselves — that separation is what makes this evidence rather than a diary.",
      cta: { href: `/w/${slug}/members`, label: "Invite teammates", primary: false },
    },
  ];

  return (
    <section className="flex flex-1 justify-center px-6 pt-12 pb-20">
      <div className="w-full max-w-[720px]">
        <p className="eyebrow text-accent-700">■ {workspaceName}</p>
        <h2 className="mt-2.5 mb-2 max-w-[18ch]">The register is empty.</h2>
        <p className="max-w-[58ch] text-[15px] leading-relaxed text-neutral-800">
          Nothing is tracked yet — which is also what a rotting spreadsheet looks like from the
          outside. Three ways to change that.
        </p>

        <div className="hair mt-8">
          {steps.map((step, i) => (
            <div
              key={step.n}
              className={`flex flex-wrap items-start gap-5 p-5 ${i > 0 ? "border-t border-[var(--divider)]" : ""}`}
            >
              <span className="num text-[28px] leading-none font-extrabold text-neutral-300">
                {step.n}
              </span>
              <div className="min-w-56 flex-1">
                <h4 className="mb-1 text-[17px]">{step.title}</h4>
                <p className="m-0 max-w-[52ch] text-[13px] leading-relaxed text-neutral-700">
                  {step.body}
                </p>
              </div>
              <Link
                href={step.cta.href}
                className={step.cta.primary ? "btn-primary" : "btn-secondary"}
              >
                {step.cta.label}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[12px] text-neutral-700">
          Once something is on the register, Lapse reminds its risk owner and approver 14, 7 and 1
          days before it expires, on the day, and weekly after that until somebody acts.
        </p>
      </div>
    </section>
  );
}
