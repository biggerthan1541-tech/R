ALTER TYPE "public"."member_role" ADD VALUE 'approver' BEFORE 'member';--> statement-breakpoint
CREATE TABLE "action_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"workspace_id" text NOT NULL,
	"exception_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "action_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "exception" ADD COLUMN "created_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "action_token" ADD CONSTRAINT "action_token_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_token" ADD CONSTRAINT "action_token_exception_id_exception_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."exception"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_token_exception_idx" ON "action_token" USING btree ("exception_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_workspace_email_idx" ON "invitation" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");