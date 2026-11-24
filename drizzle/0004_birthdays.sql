CREATE TYPE "public"."birth_leap_day" AS ENUM('feb_28', 'mar_1');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_day" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_month" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_year" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_leap_day" "birth_leap_day";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_congratulated_on" date;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_check" CHECK (("contacts"."birth_day" IS NULL) = ("contacts"."birth_month" IS NULL)
        AND ("contacts"."birth_year" IS NULL OR "contacts"."birth_day" IS NOT NULL)
        AND ("contacts"."birth_day" IS NULL OR "contacts"."birth_day" BETWEEN 1 AND 31)
        AND ("contacts"."birth_month" IS NULL OR "contacts"."birth_month" BETWEEN 1 AND 12)
        AND ("contacts"."birth_year" IS NULL OR "contacts"."birth_year" >= 1900));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birth_leap_day_check" CHECK (coalesce("contacts"."birth_day" = 29 AND "contacts"."birth_month" = 2, false) = ("contacts"."birth_leap_day" IS NOT NULL));