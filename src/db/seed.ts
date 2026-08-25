import "../../scripts/env";
import { eq } from "drizzle-orm";
import { db } from ".";
import { events, exceptions, users, workspaceMemberships, workspaces } from "./schema";
import type { EventKind, ExceptionType, RiskLevel } from "@/lib/enums";
import { addDays, today } from "@/lib/dates";

const SEED_EMAIL = process.env.SEED_EMAIL ?? "you@example.com";
const SEED_WORKSPACE = "Northwind Systems";
const SLUG = "northwind-systems";

type Seed = {
  title: string;
  type: ExceptionType;
  description: string;
  compensatingControl: string;
  riskLevel: RiskLevel;
  riskOwner: [string, string];
  approver: [string, string];
  /** Days from today; negative is already expired. */
  expiresIn: number;
  createdDaysAgo: number;
  closedDaysAgo?: number;
  evidenceUrl?: string;
  frameworkTags: string[];
  /** Who logged it. Defaults to the approver; set to SEED_EMAIL to demo the sign-off block. */
  createdBy?: string;
  extraEvents?: Array<{ kind: EventKind; note: string; actor: string; daysAgo: number }>;
};

const DANA: [string, string] = ["Dana Whitfield", "dana.whitfield@example.com"];
const PRIYA: [string, string] = ["Priya Raman", "priya.raman@example.com"];
const MARCUS: [string, string] = ["Marcus Ellery", "marcus.ellery@example.com"];
const SOFIA: [string, string] = ["Sofia Bergqvist", "sofia.bergqvist@example.com"];
const TOM: [string, string] = ["Tom Achebe", "tom.achebe@example.com"];

const SEEDS: Seed[] = [
  {
    title: "Legacy SFTP (port 22) open to Meridian Logistics CIDR",
    type: "firewall_exception",
    description:
      "Meridian's nightly manifest feed predates our API. Their integration team has no SFTP-over-TLS support until their platform upgrade completes.",
    compensatingControl:
      "Source IP allowlist limited to 2 static addresses, key-based auth only, session logging shipped to the SIEM, quarterly access review by the platform team.",
    riskLevel: "high",
    riskOwner: MARCUS,
    approver: DANA,
    expiresIn: -41,
    createdDaysAgo: 320,
    evidenceUrl: "https://jira.example.com/browse/SEC-1841",
    frameworkTags: ["SOC2", "ISO27001"],
    extraEvents: [
      {
        kind: "extended",
        note: "New expiry moved out 60 days. Meridian's platform upgrade slipped from Q1 to Q2.",
        actor: "dana.whitfield@example.com",
        daysAgo: 101,
      },
    ],
  },
  {
    title: "MFA waiver for shared warehouse scanner accounts",
    type: "mfa_waiver",
    description:
      "Handheld scanners on the Ashford floor run a firmware build with no TOTP support. Six shared accounts, badge-gated physical access only.",
    compensatingControl:
      "Accounts restricted to the WMS application, no email or VPN, network segment isolated from corporate, physical badge access to the floor, weekly login anomaly report.",
    riskLevel: "critical",
    riskOwner: TOM,
    approver: DANA,
    expiresIn: -12,
    createdDaysAgo: 190,
    evidenceUrl: "https://jira.example.com/browse/SEC-2004",
    frameworkTags: ["SOC2", "ISO27001", "PCI"],
  },
  {
    title: "Contractor admin access to prod billing database",
    type: "temp_access_grant",
    description:
      "Ravi Sundaram (Kestrel Consulting) needs read-write during the Stripe migration cutover to reconcile ledger drift.",
    compensatingControl:
      "Named individual account (no shared credentials), MFA enforced, all statements logged to pgAudit and reviewed weekly by the data team lead, access auto-revoked by IAM policy on the expiry date.",
    riskLevel: "critical",
    riskOwner: SOFIA,
    approver: DANA,
    expiresIn: 3,
    createdDaysAgo: 47,
    evidenceUrl: "https://jira.example.com/browse/SEC-2117",
    frameworkTags: ["SOC2", "PCI"],
    // Logged by the signed-in demo user, so the register shows a live example of
    // the separation-of-duties block: you cannot sign off on your own exception.
    createdBy: SEED_EMAIL,
  },
  {
    title: "Accepted: CVE-2024-31402 in image-resize sidecar",
    type: "accepted_finding",
    description:
      "Flagged high by the container scanner. The vulnerable code path is the SVG parser, which we disable at build time. Upstream fix is scheduled but unreleased.",
    compensatingControl:
      "SVG handling compiled out, sidecar runs unprivileged in a network-isolated namespace with no egress, image uploads capped at 8MB and content-type validated at the edge.",
    riskLevel: "medium",
    riskOwner: PRIYA,
    approver: DANA,
    expiresIn: 9,
    createdDaysAgo: 74,
    evidenceUrl: "https://jira.example.com/browse/SEC-2088",
    frameworkTags: ["SOC2"],
  },
  {
    title: "Password rotation policy waiver for service accounts",
    type: "policy_waiver",
    description:
      "Our policy mandates 90-day rotation. Eleven service accounts sit behind integrations that cannot hot-reload credentials without a maintenance window.",
    compensatingControl:
      "Credentials are 40-character random secrets held in Vault, never in source, with access audited. Rotation runs annually during the scheduled December maintenance window.",
    riskLevel: "medium",
    riskOwner: PRIYA,
    approver: DANA,
    expiresIn: 13,
    createdDaysAgo: 168,
    frameworkTags: ["SOC2", "ISO27001"],
    extraEvents: [
      {
        kind: "renewed",
        note: "New expiry 2026-09-04. Reviewed with platform; Vault-driven rotation is on the H2 roadmap.",
        actor: "dana.whitfield@example.com",
        daysAgo: 55,
      },
    ],
  },
  {
    title: "Analytics read replica accessible from the office VPN range",
    type: "firewall_exception",
    description:
      "The data team queries the replica directly from BI tooling that has no service-account support. Migration to the warehouse is planned.",
    compensatingControl:
      "Read-only replica with no PII columns replicated, VPN requires MFA, queries logged, replica sits in a private subnet with no internet route.",
    riskLevel: "low",
    riskOwner: SOFIA,
    approver: PRIYA,
    expiresIn: 62,
    createdDaysAgo: 28,
    frameworkTags: ["SOC2"],
  },
  {
    title: "Break-glass root credentials held by two engineers",
    type: "temp_access_grant",
    description:
      "Standing break-glass access for the on-call rotation while the PAM rollout completes. Currently held by the two platform leads.",
    compensatingControl:
      "Credentials sealed in Vault with break-glass alerting to the security channel on retrieval, hardware MFA, retrieval triggers a mandatory post-incident review.",
    riskLevel: "high",
    riskOwner: PRIYA,
    approver: DANA,
    expiresIn: 121,
    createdDaysAgo: 15,
    evidenceUrl: "https://confluence.example.com/x/breakglass",
    frameworkTags: ["SOC2", "ISO27001"],
  },
  {
    title: "Vendor risk assessment waived for Clearwater Analytics",
    type: "policy_waiver",
    description:
      "Onboarded ahead of the full assessment to hit the Q1 reporting deadline. Clearwater holds a current SOC 2 Type II we have reviewed.",
    compensatingControl:
      "SOC 2 Type II report reviewed and filed, contract carries breach notification within 24 hours, no production data shared — aggregate metrics only.",
    riskLevel: "medium",
    riskOwner: DANA,
    approver: MARCUS,
    expiresIn: 45,
    createdDaysAgo: 60,
    evidenceUrl: "https://drive.example.com/clearwater-soc2",
    frameworkTags: ["SOC2", "GDPR"],
  },
  {
    title: "Accepted: unencrypted backups on the legacy NAS",
    type: "accepted_finding",
    description:
      "Pre-2023 archives on the Ashford NAS are not encrypted at rest. Re-encrypting requires downtime the finance close cannot absorb until year end.",
    compensatingControl:
      "NAS is physically secured in a locked rack, no network route off the site VLAN, archives contain no cardholder data, restore access limited to two named admins.",
    riskLevel: "high",
    riskOwner: TOM,
    approver: DANA,
    expiresIn: 210,
    createdDaysAgo: 8,
    frameworkTags: ["ISO27001", "HIPAA"],
  },
  {
    title: "Temporary S3 public-read on marketing-assets bucket",
    type: "firewall_exception",
    description:
      "Product launch microsite served assets straight from the bucket while the CDN distribution was provisioned.",
    compensatingControl:
      "Bucket contained only approved launch imagery, no listing permission, CloudTrail data events enabled for the duration.",
    riskLevel: "low",
    riskOwner: SOFIA,
    approver: PRIYA,
    expiresIn: -30,
    closedDaysAgo: 32,
    createdDaysAgo: 96,
    evidenceUrl: "https://jira.example.com/browse/SEC-1990",
    frameworkTags: ["SOC2"],
  },
  {
    title: "MFA waiver for the Ashford reception kiosk account",
    type: "mfa_waiver",
    description:
      "Visitor sign-in kiosk ran a shared account without MFA. Replaced by the badge-integrated kiosk in March.",
    compensatingControl:
      "Kiosk locked to a single application in kiosk mode, no data access beyond the visitor log, physically supervised during opening hours.",
    riskLevel: "medium",
    riskOwner: TOM,
    approver: DANA,
    expiresIn: -74,
    closedDaysAgo: 70,
    createdDaysAgo: 240,
    frameworkTags: ["ISO27001"],
  },
];

async function main() {
  const now = today();

  let [user] = await db.select().from(users).where(eq(users.email, SEED_EMAIL));
  if (!user) {
    [user] = await db.insert(users).values({ email: SEED_EMAIL, name: "Demo Operator" }).returning();
  }

  let [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, SLUG));
  if (!workspace) {
    [workspace] = await db
      .insert(workspaces)
      .values({ name: SEED_WORKSPACE, slug: SLUG })
      .returning();
  }

  await db
    .insert(workspaceMemberships)
    .values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  await db.delete(exceptions).where(eq(exceptions.workspaceId, workspace.id));

  for (const seed of SEEDS) {
    const createdAt = daysAgo(seed.createdDaysAgo);
    const closedAt = seed.closedDaysAgo === undefined ? null : daysAgo(seed.closedDaysAgo);

    const [row] = await db
      .insert(exceptions)
      .values({
        workspaceId: workspace.id,
        title: seed.title,
        type: seed.type,
        description: seed.description,
        compensatingControl: seed.compensatingControl,
        riskLevel: seed.riskLevel,
        riskOwnerName: seed.riskOwner[0],
        riskOwnerEmail: seed.riskOwner[1],
        approverName: seed.approver[0],
        approverEmail: seed.approver[1],
        expiryDate: addDays(now, seed.expiresIn),
        closedAt,
        evidenceUrl: seed.evidenceUrl ?? null,
        frameworkTags: seed.frameworkTags,
        createdBy: seed.createdBy ?? seed.approver[1],
        status: closedAt ? "closed" : "open",
        createdAt,
        updatedAt: closedAt ?? createdAt,
      })
      .returning();

    const history = [
      {
        kind: "created" as EventKind,
        note: `Logged with expiry ${addDays(now, seed.expiresIn)}.`,
        actor: seed.createdBy ?? seed.approver[1],
        timestamp: createdAt,
      },
      ...(seed.extraEvents ?? []).map((e) => ({
        kind: e.kind,
        note: e.note,
        actor: e.actor,
        timestamp: daysAgo(e.daysAgo),
      })),
      ...(closedAt
        ? [
            {
              kind: "closed" as EventKind,
              note: "Underlying risk removed; exception retired.",
              actor: seed.approver[1],
              timestamp: closedAt,
            },
          ]
        : []),
    ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    await db.insert(events).values(
      history.map((e) => ({
        workspaceId: workspace.id,
        exceptionId: row.id,
        kind: e.kind,
        note: e.note,
        actor: e.actor,
        timestamp: e.timestamp,
      })),
    );
  }

  console.log(
    `Seeded ${SEEDS.length} exceptions into "${workspace.name}" (/w/${workspace.slug}) for ${SEED_EMAIL}.`,
  );
  process.exit(0);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
