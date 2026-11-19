CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "groups_name_normalized_idx";--> statement-breakpoint
-- user_id is added as nullable: existing rows get their owner below, then NOT NULL is set
ALTER TABLE "contacts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "user_id" text;--> statement-breakpoint
-- Hand-edited (design.md, decision 8). If contacts or groups have rows, they all go to the owner: the user with
-- the email from the app.owner_email setting (OWNER_EMAIL, passed by src/db/migrate.ts), trimmed and lower case.
-- No email: the migration fails and is rolled back as a whole. An empty database needs no email
DO $$
DECLARE
	owner_email text;
	owner_id text;
BEGIN
	IF EXISTS (SELECT 1 FROM "contacts") OR EXISTS (SELECT 1 FROM "groups") THEN
		owner_email := lower(regexp_replace(coalesce(current_setting('app.owner_email', true), ''), '^\s+|\s+$', '', 'g'));
		IF owner_email = '' THEN
			RAISE EXCEPTION 'OWNER_EMAIL is not set: existing contacts and groups need an owner, set OWNER_EMAIL for the migration';
		END IF;
		owner_id := gen_random_uuid()::text;
		INSERT INTO "users" ("id", "name", "email", "email_verified") VALUES (owner_id, '', owner_email, true);
		UPDATE "contacts" SET "user_id" = owner_id;
		UPDATE "groups" SET "user_id" = owner_id;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_emails_email_sent_at_idx" ON "login_emails" USING btree ("email","sent_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_user_id_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_user_id_idx" ON "groups" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_user_name_normalized_idx" ON "groups" USING btree ("user_id",lower(translate("name", 'Ёё', 'Ее')));