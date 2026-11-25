ALTER TABLE "login_emails" ADD COLUMN "ip" text;--> statement-breakpoint
CREATE INDEX "login_emails_ip_sent_at_idx" ON "login_emails" USING btree ("ip","sent_at");