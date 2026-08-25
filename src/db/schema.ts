import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import {
  EVENT_KINDS,
  EXCEPTION_STATUSES,
  EXCEPTION_TYPES,
  MEMBER_ROLES,
  RISK_LEVELS,
} from "@/lib/enums";
import type { AdapterAccountType } from "next-auth/adapters";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/* -------------------------------------------------------------------------- */
/* Auth.js tables                                                             */
/* -------------------------------------------------------------------------- */

export const users = pgTable("user", {
  id: id(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* -------------------------------------------------------------------------- */
/* Tenancy                                                                    */
/* -------------------------------------------------------------------------- */

export const workspaces = pgTable("workspace", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Nag lead times in days before expiry, descending. Day 0 (expiry day) is always nagged.
  nagLeadDays: integer("nag_lead_days")
    .array()
    .notNull()
    .default(sql`ARRAY[14, 7, 1]::integer[]`),
  slackWebhookUrl: text("slack_webhook_url"),
  nagEmailEnabled: boolean("nag_email_enabled").notNull().default(true),
  nagSlackEnabled: boolean("nag_slack_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberRoleEnum = pgEnum("member_role", MEMBER_ROLES);

export const workspaceMemberships = pgTable(
  "workspace_membership",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("membership_workspace_user_idx").on(t.workspaceId, t.userId)],
);

/* -------------------------------------------------------------------------- */
/* Exceptions                                                                 */
/* -------------------------------------------------------------------------- */

export const exceptionTypeEnum = pgEnum("exception_type", EXCEPTION_TYPES);

export const riskLevelEnum = pgEnum("risk_level", RISK_LEVELS);

/**
 * Stored lifecycle state. `open | expiring | expired` are maintained by the daily
 * cron for reporting and nag bookkeeping, but every read derives the live status
 * from expiry_date + closed_at so the UI is never stale between cron runs.
 */
export const exceptionStatusEnum = pgEnum("exception_status", EXCEPTION_STATUSES);

export const exceptions = pgTable(
  "exception",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: exceptionTypeEnum("type").notNull(),
    description: text("description").notNull().default(""),
    compensatingControl: text("compensating_control").notNull().default(""),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    riskOwnerName: text("risk_owner_name").notNull(),
    riskOwnerEmail: text("risk_owner_email").notNull(),
    approverName: text("approver_name").notNull(),
    approverEmail: text("approver_email").notNull(),
    status: exceptionStatusEnum("status").notNull().default("open"),
    // Who logged it. Separation of duties: this person cannot sign off on it.
    createdBy: text("created_by").notNull().default(""),
    // Calendar date (no time-of-day): expiry is a business day, not an instant.
    expiryDate: text("expiry_date").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    evidenceUrl: text("evidence_url"),
    frameworkTags: text("framework_tags").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("exception_workspace_idx").on(t.workspaceId),
    index("exception_expiry_idx").on(t.workspaceId, t.expiryDate),
  ],
);

export const eventKindEnum = pgEnum("event_kind", EVENT_KINDS);

export const events = pgTable(
  "event",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    exceptionId: text("exception_id")
      .notNull()
      .references(() => exceptions.id, { onDelete: "cascade" }),
    kind: eventKindEnum("kind").notNull(),
    note: text("note").notNull().default(""),
    actor: text("actor").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_exception_idx").on(t.exceptionId, t.timestamp)],
);

/**
 * One row per (exception, nag milestone) so a re-run of the daily cron — or two
 * runs in one day — cannot double-nag an owner.
 */
export const nagLog = pgTable(
  "nag_log",
  {
    id: id(),
    exceptionId: text("exception_id")
      .notNull()
      .references(() => exceptions.id, { onDelete: "cascade" }),
    // Days remaining at the time the nag fired; 0 = expiry day, negative = overdue sweep.
    leadDays: integer("lead_days").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("nag_log_exception_lead_idx").on(t.exceptionId, t.leadDays)],
);

/**
 * A pending workspace invitation. Claimed automatically the first time the
 * invited address signs in, so an invite works whether the person follows the
 * link or simply signs up.
 */
export const invitations = pgTable(
  "invitation",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRoleEnum("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    invitedBy: text("invited_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("invitation_workspace_email_idx").on(t.workspaceId, t.email),
    index("invitation_email_idx").on(t.email),
  ],
);

/**
 * The bearer link inside a nag email. It authenticates the risk owner or
 * approver, joins them to the workspace if they are not a member yet, and drops
 * them on the exception it was minted for — so a reminder is actionable by
 * someone who has never signed in.
 */
export const actionTokens = pgTable(
  "action_token",
  {
    id: id(),
    token: text("token").notNull().unique(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    exceptionId: text("exception_id")
      .notNull()
      .references(() => exceptions.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("action_token_exception_idx").on(t.exceptionId, t.email)],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  memberships: many(workspaceMemberships),
  exceptions: many(exceptions),
}));

export const membershipRelations = relations(workspaceMemberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMemberships.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [workspaceMemberships.userId], references: [users.id] }),
}));

export const exceptionRelations = relations(exceptions, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [exceptions.workspaceId],
    references: [workspaces.id],
  }),
  events: many(events),
}));

export const eventRelations = relations(events, ({ one }) => ({
  exception: one(exceptions, {
    fields: [events.exceptionId],
    references: [exceptions.id],
  }),
}));

export type Workspace = typeof workspaces.$inferSelect;
export type Exception = typeof exceptions.$inferSelect;
export type NewException = typeof exceptions.$inferInsert;
export type ExceptionEvent = typeof events.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type ActionToken = typeof actionTokens.$inferSelect;
export type { ExceptionType, RiskLevel, ExceptionStatus, EventKind, MemberRole } from "@/lib/enums";
