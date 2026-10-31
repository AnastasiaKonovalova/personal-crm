CREATE TYPE "public"."contact_cadence" AS ENUM('week', 'month', 'quarter', 'half_year', 'year', 'date');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "cadence" "contact_cadence";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_on" date;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_cadence_contact_on_check" CHECK (coalesce("contacts"."cadence" = 'date', false) = ("contacts"."contact_on" IS NOT NULL));