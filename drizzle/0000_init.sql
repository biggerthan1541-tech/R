CREATE TYPE "public"."event_kind" AS ENUM('created', 'updated', 'renewed', 'extended', 'closed', 'reopened', 'status_changed', 'nag_sent', 'imported');--> statement-breakpoint
CREATE TYPE "public"."exception_status" AS ENUM('open', 'expiring', 'expired', 'closed', 'renewed');--> statement-breakpoint
CREATE TYPE "public"."exception_type" AS ENUM('firewall_exception', 'temp_access_grant', 'accepted_finding', 'mfa_waiver', 'policy_waiver', 'other');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"exception_id" text NOT NULL,
	"kind" "event_kind" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exception" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"type" "exception_type" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"compensating_control" text DEFAULT '' NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"risk_owner_name" text NOT NULL,
	"risk_owner_email" text NOT NULL,
	"approver_name" text NOT NULL,
	"approver_email" text NOT NULL,
	"status" "exception_status" DEFAULT 'open' NOT NULL,
	"expiry_date" text NOT NULL,
	"closed_at" timestamp with time zone,
	"evidence_url" text,
	"framework_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nag_log" (
	"id" text PRIMARY KEY NOT NULL,
	"exception_id" text NOT NULL,
	"lead_days" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "workspace_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"nag_lead_days" integer[] DEFAULT ARRAY[14, 7, 1]::integer[] NOT NULL,
	"slack_webhook_url" text,
	"nag_email_enabled" boolean DEFAULT true NOT NULL,
	"nag_slack_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_exception_id_exception_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."exception"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception" ADD CONSTRAINT "exception_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nag_log" ADD CONSTRAINT "nag_log_exception_id_exception_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."exception"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_exception_idx" ON "event" USING btree ("exception_id","timestamp");--> statement-breakpoint
CREATE INDEX "exception_workspace_idx" ON "exception" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "exception_expiry_idx" ON "exception" USING btree ("workspace_id","expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "nag_log_exception_lead_idx" ON "nag_log" USING btree ("exception_id","lead_days");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_workspace_user_idx" ON "workspace_membership" USING btree ("workspace_id","user_id");