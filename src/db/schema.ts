import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const contactCadence = pgEnum("contact_cadence", [
  "week",
  "month",
  "quarter",
  "half_year",
  "year",
  "date",
]);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    // NULL means "not set"; contactOn is filled only when cadence is 'date'
    cadence: contactCadence("cadence"),
    contactOn: date("contact_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "contacts_cadence_contact_on_check",
      // coalesce: with cadence NULL a plain comparison yields NULL, which CHECK lets through
      sql`coalesce(${table.cadence} = 'date', false) = (${table.contactOn} IS NOT NULL)`,
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

export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
