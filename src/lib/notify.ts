/** Outbound channels for nags. Both no-op to the console when DRY_RUN is on. */

export function isDryRun(): boolean {
  return process.env.DRY_RUN_NOTIFICATIONS === "1" || !process.env.AUTH_RESEND_KEY;
}

export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (msg.to.length === 0) return;
  if (isDryRun()) {
    console.log(`[dry-run email] to=${msg.to.join(", ")} subject=${msg.subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "Lapse <onboarding@resend.dev>",
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

export async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  if (isDryRun()) {
    console.log(`[dry-run slack] ${text.split("\n")[0]}`);
    return;
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack webhook error ${res.status}: ${await res.text()}`);
}
