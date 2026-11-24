import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const contactCadence = pgEnum("contact_cadence", [
  "week",
  "month",
  "quarter",
  "half_year",
  "year",
  "date",
]);

// The day a 29 February birthday is celebrated in a common year
export const birthLeapDay = pgEnum("birth_leap_day", ["feb_28", "mar_1"]);

// Better Auth tables (users, sessions, accounts, verifications): the fields are those of better-auth
// 1.7.25 (@better-auth/core get-tables), the table names are plural like ours. Better Auth fills the ids
// and the dates itself; the defaults only let a row be inserted by hand (migration 0003, tests)
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Stored normalized (trimmed, lower case); unique
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// Sign-in by link uses no accounts today; Better Auth still expects the table
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

// Sign-in links: identifier is "magic-link:<token>", value is the JSON with the email (see design.md, decision 4)
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// One row per sign-in email sent: the limit of 3 emails in 10 minutes per address counts these (design.md, decision 3)
export const loginEmails = pgTable(
  "login_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Normalized like users.email
    email: text("email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("login_emails_email_sent_at_idx").on(table.email, table.sentAt)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The owner; notes and group memberships belong to the owner of their contact. No cascade: deleting a user is not supported
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    // NULL means "not set"; contactOn is filled only when cadence is 'date'
    cadence: contactCadence("cadence"),
    contactOn: date("contact_on", { mode: "string" }),
    // Birthday: day and month together or none, the year is optional. Whether the date exists and is
    // not in the future is checked in code (validation.ts): a CHECK cannot say it
    birthDay: smallint("birth_day"),
    birthMonth: smallint("birth_month"),
    birthYear: smallint("birth_year"),
    // Set exactly when the birthday is 29 February
    birthLeapDay: birthLeapDay("birth_leap_day"),
    // Day of the last «Поздравил(а)» in APP_TIME_ZONE; hides the birthday from the block until the next one (birthdays.ts)
    birthCongratulatedOn: date("birth_congratulated_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contacts_user_id_idx").on(table.userId),
    check(
      "contacts_cadence_contact_on_check",
      // coalesce: with cadence NULL a plain comparison yields NULL, which CHECK lets through
      sql`coalesce(${table.cadence} = 'date', false) = (${table.contactOn} IS NOT NULL)`,
    ),
    check(
      "contacts_birthday_check",
      sql`(${table.birthDay} IS NULL) = (${table.birthMonth} IS NULL)
        AND (${table.birthYear} IS NULL OR ${table.birthDay} IS NOT NULL)
        AND (${table.birthDay} IS NULL OR ${table.birthDay} BETWEEN 1 AND 31)
        AND (${table.birthMonth} IS NULL OR ${table.birthMonth} BETWEEN 1 AND 12)
        AND (${table.birthYear} IS NULL OR ${table.birthYear} >= 1900)`,
    ),
    check(
      "contacts_birth_leap_day_check",
      // coalesce: with the day NULL the comparison yields NULL, which CHECK lets through
      sql`coalesce(${table.birthDay} = 29 AND ${table.birthMonth} = 2, false) = (${table.birthLeapDay} IS NOT NULL)`,
    ),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notes_contact_id_created_at_idx").on(table.contactId, table.createdAt)],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("groups_user_id_idx").on(table.userId),
    // Same normalization as normalizeGroupName in code: case and "ё/е" do not differ. Unique per user:
    // two users may each have their own "Друзья"
    uniqueIndex("groups_user_name_normalized_idx").on(
      table.userId,
      sql`lower(translate(${table.name}, 'Ёё', 'Ее'))`,
    ),
    check("groups_name_length_check", sql`char_length(${table.name}) <= 50`),
  ],
);

export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    index("contact_groups_group_id_idx").on(table.groupId),
  ],
);

export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Group = typeof groups.$inferSelect;
