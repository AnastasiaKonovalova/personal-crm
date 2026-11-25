import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

// Migrations must not damage existing data. For each migration a throwaway database next to the
// one in .env gets every migration before it, fictional data, then the migration itself. The
// tables and columns that existed before are compared row by row; new tables and columns are
// reported for the migration's own test to check. The working database is never touched.
//
// Every migration in drizzle/meta/_journal.json needs its own test in "data checks per migration":
// a new migration without one fails "every migration has a data check".

const MIGRATIONS = path.resolve("drizzle");

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};
type Journal = { version: string; dialect: string; entries: JournalEntry[] };
// Table -> its columns in order
type Shape = Record<string, string[]>;
type Row = Record<string, unknown>;

async function readJournal(): Promise<Journal> {
  return JSON.parse(await readFile(path.join(MIGRATIONS, "meta", "_journal.json"), "utf8"));
}

function urlFor(database: string | null) {
  const url = new URL(process.env.DATABASE_URL!);
  if (database) url.pathname = `/${database}`;
  return url.toString();
}

// `options` are Postgres startup options for the connection (`-c name=value`)
async function withPool<T>(
  database: string | null,
  run: (pool: Pool) => Promise<T>,
  options?: string,
) {
  const pool = new Pool({ connectionString: urlFor(database), max: 1, options });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

// The `app.owner_email` setting migration 0003 reads: a startup option, where a backslash and whitespace need
// escaping. Same as in src/db/migrate.ts, which the production image runs as a single file
const ownerOptions = (email: string | undefined) =>
  email === undefined ? undefined : `-c app.owner_email=${email.replace(/[\\\s]/g, "\\$&")}`;

// A migrations folder with the given entries; `extra` holds SQL of entries that are not in ./drizzle
async function migrationsFolder(
  journal: Journal,
  entries: JournalEntry[],
  extra: Record<string, string>,
) {
  const folder = await mkdtemp(path.join(tmpdir(), "crm-migrations-"));
  await mkdir(path.join(folder, "meta"));
  for (const { tag } of entries) {
    const target = path.join(folder, `${tag}.sql`);
    if (tag in extra) await writeFile(target, extra[tag]);
    else await copyFile(path.join(MIGRATIONS, `${tag}.sql`), target);
  }
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  return folder;
}

async function shapeOf(pool: Pool): Promise<Shape> {
  const { rows } = await pool.query<{ table: string; column: string }>(
    `select table_name as table, column_name as column from information_schema.columns
     where table_schema = 'public'
     order by table_name, ordinal_position`,
  );
  const shape: Shape = {};
  for (const { table, column } of rows) (shape[table] ??= []).push(column);
  return shape;
}

// Values as Postgres renders them in JSON: a changed type or value gives a different text
async function rowsOf(pool: Pool, table: string, columns: string[]) {
  const { rows } = await pool.query<{ row: Row }>(
    `select row_to_json(t) as row from (select ${columns.map(quote).join(", ")} from ${quote(table)}) t`,
  );
  return rows.map((item) => item.row);
}

// Rows reduced to the given columns, as sorted text: order-independent comparison
function comparable(rows: Row[], columns: string[]) {
  return rows.map((row) => JSON.stringify(columns.map((column) => row[column]))).sort();
}

type Check = {
  // Fictional rows for the schema as it is right before the migration
  fill: (pool: Pool) => Promise<void>;
  // Extra queries on the migrated database, e.g. what the new columns hold
  inspect?: (pool: Pool) => Promise<unknown>;
  // Value of `app.owner_email` on the connection that runs the migration; not set when omitted
  ownerEmail?: string;
  // The migration is expected to fail: its error goes to the report and the checks run on what is left
  expectError?: boolean;
};

type MigrationReport = {
  rowsBefore: Record<string, number>;
  problems: string[];
  newTables: string[];
  newColumns: Record<string, string[]>;
  inspected: unknown;
  // Error of the migration when `expectError` is set and it failed; otherwise null
  error: string | null;
};

const EXTRA_TAG = "9999_extra";

// `target` is a tag from the journal, or SQL appended as an extra latest migration (the self-check)
async function checkMigration(
  target: { tag: string } | { sql: string },
  { fill, inspect, ownerEmail, expectError }: Check,
): Promise<MigrationReport> {
  const journal = await readJournal();
  const extra: Record<string, string> = {};
  let entries = journal.entries;
  if ("sql" in target) {
    const last = entries.at(-1)!;
    entries = [...entries, { ...last, idx: entries.length, tag: EXTRA_TAG, when: last.when + 1 }];
    extra[EXTRA_TAG] = target.sql;
  }
  const tag = "tag" in target ? target.tag : EXTRA_TAG;
  const index = entries.findIndex((entry) => entry.tag === tag);
  if (index < 1) throw new Error(`No migration ${tag} with migrations before it in the journal`);

  const database = `crm_migration_check_${randomUUID().slice(0, 8)}`;
  const beforeFolder = await migrationsFolder(journal, entries.slice(0, index), extra);
  const afterFolder = await migrationsFolder(journal, entries.slice(0, index + 1), extra);
  const apply = (folder: string, options?: string) =>
    withPool(
      database,
      (pool) => migrate(drizzle({ client: pool }), { migrationsFolder: folder }),
      options,
    );

  await withPool(null, (pool) => pool.query(`create database ${quote(database)}`));
  try {
    await apply(beforeFolder);
    const before = await withPool(database, async (pool) => {
      await fill(pool);
      const shape = await shapeOf(pool);
      const rows: Record<string, Row[]> = {};
      for (const [table, columns] of Object.entries(shape))
        rows[table] = await rowsOf(pool, table, columns);
      return { shape, rows };
    });

    let error: string | null = null;
    try {
      await apply(afterFolder, ownerOptions(ownerEmail));
    } catch (caught) {
      if (!expectError) throw caught;
      // drizzle wraps the database error: the message of the original is in `cause`
      const cause = caught instanceof Error ? caught.cause : undefined;
      error = [caught, cause].map((item) => (item instanceof Error ? item.message : "")).join(" ");
    }
    return await withPool(database, async (pool) => {
      const shape = await shapeOf(pool);
      const problems: string[] = [];
      const newColumns: Record<string, string[]> = {};

      for (const [table, columns] of Object.entries(before.shape)) {
        if (!shape[table]) {
          problems.push(`${table}: table is gone`);
          continue;
        }
        const kept = columns.filter((column) => shape[table].includes(column));
        for (const column of columns) {
          if (!kept.includes(column)) problems.push(`${table}.${column}: column is gone`);
        }
        // Only the columns that existed before: a new column is not a change of the old data
        const afterRows = await rowsOf(pool, table, kept);
        if (
          JSON.stringify(comparable(afterRows, kept)) !==
          JSON.stringify(comparable(before.rows[table], kept))
        ) {
          problems.push(`${table}: rows changed`);
        }
        const added = shape[table].filter((column) => !columns.includes(column));
        if (added.length > 0) newColumns[table] = added;
      }

      const rowsBefore = Object.fromEntries(
        Object.entries(before.rows).map(([table, rows]) => [table, rows.length]),
      );
      return {
        rowsBefore,
        problems,
        newTables: Object.keys(shape)
          .filter((table) => !before.shape[table])
          .sort(),
        newColumns,
        inspected: inspect ? await inspect(pool) : undefined,
        error,
      };
    });
  } finally {
    await withPool(null, (pool) =>
      pool.query(`drop database if exists ${quote(database)} with (force)`),
    );
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(afterFolder, { recursive: true, force: true });
  }
}

const count = async (pool: Pool, sql: string) => (await pool.query<{ n: number }>(sql)).rows[0].n;

// Fictional data. Contacts before 0001 have no cadence columns
async function fillContactsWithoutCadence(pool: Pool) {
  await pool.query(`
    insert into contacts (name, about, how_we_met, phone, email, created_at) values
      ('Анна Тестова', 'Дизайнер', 'Курсы', '+7 (000) 111-11-11', 'anna@example.com', now() - interval '30 days'),
      ('Борис Пробный', null, null, null, null, now() - interval '400 days'),
      ('Вера Ёлкина', 'Соседка', 'Соседи по дому', null, 'vera@example.org', now() - interval '5 days')
  `);
  await fillNotes(pool);
}

// `owner` is the id of an existing user: from 0003 on every contact needs one, before it there is no user_id
async function fillContactsWithCadence(pool: Pool, owner?: string) {
  const [column, value] = owner ? ["user_id, ", `'${owner}', `] : ["", ""];
  await pool.query(`
    insert into contacts (${column}name, about, how_we_met, phone, email, cadence, contact_on, created_at) values
      (${value}'Анна Тестова', 'Дизайнер', 'Курсы', '+7 (000) 111-11-11', 'anna@example.com', 'week', null, now() - interval '30 days'),
      (${value}'Борис Пробный', null, null, null, null, null, null, now() - interval '400 days'),
      (${value}'Вера Ёлкина', 'Соседка', 'Соседи по дому', null, 'vera@example.org', 'date', current_date + 10, now() - interval '5 days'),
      (${value}'Глеб Выдуманный', 'Однокурсник', null, '+7 (000) 222-22-22', null, 'year', null, now() - interval '2 days')
  `);
  await fillNotes(pool);
}

// The same contacts and notes for the schema from 0003 on (the self-checks append theirs after the last migration)
const CHECK_USER = "check-user";
async function fillContactsOfUser(pool: Pool) {
  await pool.query(
    "insert into users (id, name, email, email_verified) values ($1, '', 'check@example.com', true)",
    [CHECK_USER],
  );
  await fillContactsWithCadence(pool, CHECK_USER);
}

// Contacts of one user with notes, groups and memberships, for the schema from 0003 on
async function fillContactsGroupsNotesOfUser(pool: Pool) {
  await fillContactsOfUser(pool);
  await pool.query(
    `insert into groups (user_id, name, created_at) values
      ($1, 'Друзья', now() - interval '20 days'),
      ($1, 'Соседи', now() - interval '10 days')`,
    [CHECK_USER],
  );
  await pool.query(`
    insert into contact_groups (contact_id, group_id)
    select c.id, g.id from contacts c join groups g
      on (c.name = 'Анна Тестова' and g.name in ('Друзья', 'Соседи'))
      or (c.name = 'Вера Ёлкина' and g.name = 'Соседи')
  `);
}

async function fillNotes(pool: Pool) {
  await pool.query(`
    insert into notes (contact_id, body, created_at)
    select id, 'Созвонились по поводу ремонта', now() - interval '3 days' from contacts where name in ('Анна Тестова', 'Вера Ёлкина')
    union all
    select id, 'Поздравить с днём рождения', now() - interval '1 day' from contacts where name = 'Анна Тестова'
  `);
}

// Contacts, notes, groups and memberships as they are right before 0003: «Анна» is in two groups,
// «Вера» in one, «Ёлка» is empty
async function fillContactsGroupsNotes(pool: Pool) {
  await fillContactsWithCadence(pool);
  await pool.query(`
    insert into groups (name, created_at) values
      ('Друзья', now() - interval '20 days'),
      ('Соседи', now() - interval '10 days'),
      ('Ёлка', now())
  `);
  await pool.query(`
    insert into contact_groups (contact_id, group_id)
    select c.id, g.id from contacts c join groups g
      on (c.name = 'Анна Тестова' and g.name in ('Друзья', 'Соседи'))
      or (c.name = 'Вера Ёлкина' and g.name = 'Соседи')
  `);
}

const OWNER = "owner@example.com";

// How many rows of a table belong to the user with the owner's email, out of all rows
async function ownership(pool: Pool, table: "contacts" | "groups") {
  return {
    total: await count(pool, `select count(*)::int as n from ${table}`),
    ofOwner: await count(
      pool,
      `select count(*)::int as n from ${table} t join users u on u.id = t.user_id where u.email = '${OWNER}'`,
    ),
  };
}

// A statement's outcome: "ok" or the Postgres error code
const outcome = (pool: Pool, sql: string, params: unknown[] = []) =>
  pool.query(sql, params).then(
    () => "ok",
    (error: { code?: string }) => error.code ?? "error",
  );

// One test per migration from the journal; the first one runs on an empty database and has none
const CHECKED_MIGRATIONS = [
  "0001_unique_rachel_grey",
  "0002_gorgeous_magdalene",
  "0003_login",
  "0004_birthdays",
  "0005_login_email_ip",
];

describe("data checks per migration", () => {
  it("every migration has a data check", async () => {
    const tags = (await readJournal()).entries.slice(1).map((entry) => entry.tag);
    expect(CHECKED_MIGRATIONS).toEqual(tags);
  });

  it("0001 keep-in-touch: old contacts get no cadence, data and notes unchanged (scenario «Существующие контакты после выкатки»)", async () => {
    const report = await checkMigration(
      { tag: "0001_unique_rachel_grey" },
      {
        fill: fillContactsWithoutCadence,
        inspect: async (pool) => ({
          withCadence: await count(
            pool,
            "select count(*)::int as n from contacts where cadence is not null or contact_on is not null",
          ),
        }),
      },
    );
    expect(report.rowsBefore).toMatchObject({ contacts: 3, notes: 3 });
    expect(report.problems).toEqual([]);
    expect(report.newTables).toEqual([]);
    expect(report.newColumns).toEqual({ contacts: ["cadence", "contact_on"] });
    expect(report.inspected).toEqual({ withCadence: 0 });
  });

  it("0002 groups: old contacts are in no group, data and notes unchanged (scenario «Существующие контакты после выкатки»)", async () => {
    const report = await checkMigration(
      { tag: "0002_gorgeous_magdalene" },
      {
        fill: fillContactsWithCadence,
        inspect: async (pool) => ({
          groups: await count(pool, "select count(*)::int as n from groups"),
          memberships: await count(pool, "select count(*)::int as n from contact_groups"),
        }),
      },
    );
    expect(report.rowsBefore).toMatchObject({ contacts: 4, notes: 3 });
    expect(report.problems).toEqual([]);
    expect(report.newTables).toEqual(["contact_groups", "groups"]);
    expect(report.newColumns).toEqual({});
    expect(report.inspected).toEqual({ groups: 0, memberships: 0 });
  });

  it("0003 login: all contacts and groups go to one user with the normalized owner email, old data unchanged (scenario «Выкатка на базе с данными»)", async () => {
    const report = await checkMigration(
      { tag: "0003_login" },
      {
        fill: fillContactsGroupsNotes,
        ownerEmail: " Owner@Example.COM ",
        inspect: async (pool) => ({
          users: (await pool.query<{ email: string }>("select email from users")).rows.map(
            (row) => row.email,
          ),
          contacts: await ownership(pool, "contacts"),
          groups: await ownership(pool, "groups"),
        }),
      },
    );
    // notes and contact_groups are compared row by row with the other old tables: their owner is the contact's
    expect(report.rowsBefore).toMatchObject({
      contacts: 4,
      notes: 3,
      groups: 3,
      contact_groups: 3,
    });
    expect(report.error).toBeNull();
    expect(report.problems).toEqual([]);
    expect(report.newTables).toEqual([
      "accounts",
      "login_emails",
      "sessions",
      "users",
      "verifications",
    ]);
    expect(report.newColumns).toEqual({ contacts: ["user_id"], groups: ["user_id"] });
    expect(report.inspected).toEqual({
      users: [OWNER],
      contacts: { total: 4, ofOwner: 4 },
      groups: { total: 3, ofOwner: 3 },
    });
  });

  it.each([
    ["is not set", undefined],
    ["is empty", ""],
    ["is only spaces", "   "],
  ])(
    "0003 login: owner email %s and data exists: the migration fails, nothing changes (scenario «Выкатка на базе с данными»)",
    async (_label, ownerEmail) => {
      const report = await checkMigration(
        { tag: "0003_login" },
        { fill: fillContactsGroupsNotes, ownerEmail, expectError: true },
      );
      expect(report.error).toMatch(/OWNER_EMAIL/);
      // the whole migration is rolled back: no new tables or columns, old rows as they were
      expect(report.rowsBefore).toMatchObject({
        contacts: 4,
        notes: 3,
        groups: 3,
        contact_groups: 3,
      });
      expect(report.problems).toEqual([]);
      expect(report.newTables).toEqual([]);
      expect(report.newColumns).toEqual({});
    },
  );

  it("0003 login: an empty database migrates without an owner email (CI, a new install)", async () => {
    const report = await checkMigration(
      { tag: "0003_login" },
      {
        fill: async () => {},
        inspect: (pool) => count(pool, "select count(*)::int as n from users"),
      },
    );
    expect(report.error).toBeNull();
    expect(report.problems).toEqual([]);
    expect(report.inspected).toBe(0);
  });

  it("0003 login: a record without an owner cannot exist, a group name is unique per user (scenarios «Новый контакт», «Две группы „Друзья“»)", async () => {
    const insertGroup = (pool: Pool, name: string, userId: string) =>
      outcome(pool, "insert into groups (name, user_id) values ($1, $2)", [name, userId]);
    const report = await checkMigration(
      { tag: "0003_login" },
      {
        fill: async () => {},
        inspect: async (pool) => {
          await pool.query(`
            insert into users (id, name, email, email_verified) values
              ('user-a', '', 'a@example.com', true),
              ('user-b', '', 'b@example.com', true)
          `);
          return {
            groupOfA: await insertGroup(pool, "Друзья", "user-a"),
            sameNameOfB: await insertGroup(pool, "Друзья", "user-b"),
            sameNameOfA: await insertGroup(pool, "Друзья", "user-a"),
            otherCaseOfA: await insertGroup(pool, "друзья", "user-a"),
            contactWithoutOwner: await outcome(
              pool,
              "insert into contacts (name) values ('Без владельца')",
            ),
            contactOfUnknownUser: await outcome(
              pool,
              "insert into contacts (name, user_id) values ('Чужой', 'nobody')",
            ),
            groupWithoutOwner: await outcome(pool, "insert into groups (name) values ('Ничья')"),
          };
        },
      },
    );
    expect(report.inspected).toEqual({
      groupOfA: "ok",
      sameNameOfB: "ok",
      sameNameOfA: "23505", // unique violation
      otherCaseOfA: "23505", // the same normalization as before: case does not matter
      contactWithoutOwner: "23502", // not null violation
      contactOfUnknownUser: "23503", // foreign key violation
      groupWithoutOwner: "23502",
    });
  });

  it("0004 birthdays: old contacts get no birthday, data, notes and groups unchanged (scenario «Существующие контакты после выкатки»)", async () => {
    const report = await checkMigration(
      { tag: "0004_birthdays" },
      {
        fill: fillContactsGroupsNotesOfUser,
        inspect: (pool) =>
          count(
            pool,
            `select count(*)::int as n from contacts
             where birth_day is not null or birth_month is not null
               or birth_year is not null or birth_leap_day is not null
               or birth_congratulated_on is not null`,
          ),
      },
    );
    expect(report.rowsBefore).toMatchObject({
      contacts: 4,
      notes: 3,
      groups: 2,
      contact_groups: 3,
    });
    expect(report.problems).toEqual([]);
    expect(report.newTables).toEqual([]);
    expect(report.newColumns).toEqual({
      contacts: [
        "birth_day",
        "birth_month",
        "birth_year",
        "birth_leap_day",
        "birth_congratulated_on",
      ],
    });
    expect(report.inspected).toBe(0);
  });

  it("0004 birthdays: the database lets in only a whole birthday, the leap day choice only for 29 February (design.md decision 1)", async () => {
    // [day, month, year, leap day choice]
    const insert = (pool: Pool, birthday: [unknown, unknown, unknown, unknown]) =>
      outcome(
        pool,
        `insert into contacts (user_id, name, birth_day, birth_month, birth_year, birth_leap_day)
         values ($1, 'Проба', $2, $3, $4, $5)`,
        [CHECK_USER, ...birthday],
      );
    const report = await checkMigration(
      { tag: "0004_birthdays" },
      {
        fill: fillContactsOfUser,
        inspect: async (pool) => ({
          none: await insert(pool, [null, null, null, null]),
          withoutYear: await insert(pool, [3, 3, null, null]),
          withYear: await insert(pool, [25, 11, 1990, null]),
          leapDayFeb28: await insert(pool, [29, 2, null, "feb_28"]),
          leapDayMar1: await insert(pool, [29, 2, 1992, "mar_1"]),
          dayWithoutMonth: await insert(pool, [3, null, null, null]),
          monthWithoutDay: await insert(pool, [null, 4, null, null]),
          yearWithoutDay: await insert(pool, [null, null, 1990, null]),
          choiceForOtherDate: await insert(pool, [3, 3, null, "mar_1"]),
          choiceWithoutDate: await insert(pool, [null, null, null, "feb_28"]),
          leapDayWithoutChoice: await insert(pool, [29, 2, null, null]),
          day0: await insert(pool, [0, 1, null, null]),
          day32: await insert(pool, [32, 1, null, null]),
          month13: await insert(pool, [1, 13, null, null]),
          year1899: await insert(pool, [1, 1, 1899, null]),
          unknownChoice: await insert(pool, [29, 2, null, "mar_2"]),
        }),
      },
    );
    expect(report.inspected).toEqual({
      none: "ok",
      withoutYear: "ok",
      withYear: "ok",
      leapDayFeb28: "ok",
      leapDayMar1: "ok",
      dayWithoutMonth: "23514", // check violation
      monthWithoutDay: "23514",
      yearWithoutDay: "23514",
      choiceForOtherDate: "23514",
      choiceWithoutDate: "23514",
      leapDayWithoutChoice: "23514",
      day0: "23514",
      day32: "23514",
      month13: "23514",
      year1899: "23514",
      unknownChoice: "22P02", // invalid input value for enum
    });
  });

  it("0005 login email ip: old sign-in email rows keep their address and time and get no IP, contacts unchanged (email-ip-limit design.md, Migration Plan)", async () => {
    const report = await checkMigration(
      { tag: "0005_login_email_ip" },
      {
        fill: async (pool) => {
          await fillContactsOfUser(pool);
          await pool.query(`
            insert into login_emails (email, sent_at) values
              ('anna@example.com', now() - interval '5 minutes'),
              ('anna@example.com', now() - interval '2 hours'),
              ('boris@example.org', now() - interval '20 hours')
          `);
        },
        inspect: (pool) =>
          count(pool, "select count(*)::int as n from login_emails where ip is not null"),
      },
    );
    expect(report.rowsBefore).toMatchObject({ contacts: 4, notes: 3, login_emails: 3 });
    expect(report.problems).toEqual([]);
    expect(report.newTables).toEqual([]);
    expect(report.newColumns).toEqual({ login_emails: ["ip"] });
    expect(report.inspected).toBe(0);
  });
});

// The check itself, on extra migrations appended after the real ones
describe("the data check", () => {
  it.each([
    [
      "changes a value",
      `UPDATE "contacts" SET "about" = NULL WHERE "name" = 'Анна Тестова';`,
      ["contacts: rows changed"],
    ],
    [
      "deletes a row",
      `DELETE FROM "notes" WHERE "body" LIKE 'Поздравить%';`,
      ["notes: rows changed"],
    ],
    [
      "adds a row",
      `INSERT INTO "contacts" ("name", "user_id") VALUES ('Лишний', '${CHECK_USER}');`,
      ["contacts: rows changed"],
    ],
    [
      "drops a column",
      `ALTER TABLE "contacts" DROP COLUMN "phone";`,
      ["contacts.phone: column is gone"],
    ],
    ["drops a table", `DROP TABLE "notes";`, ["notes: table is gone"]],
    [
      "changes a column type",
      `ALTER TABLE "contacts" ALTER COLUMN "created_at" TYPE date;`,
      ["contacts: rows changed"],
    ],
    [
      "adds a column and damages an old one",
      `ALTER TABLE "contacts" ADD COLUMN "nickname" text; UPDATE "contacts" SET "email" = NULL;`,
      ["contacts: rows changed"],
    ],
    [
      "drops a column and damages another",
      `ALTER TABLE "contacts" DROP COLUMN "phone"; UPDATE "contacts" SET "about" = 'x';`,
      ["contacts.phone: column is gone", "contacts: rows changed"],
    ],
  ])("catches a migration that %s", async (_label, sql, expected) => {
    const report = await checkMigration({ sql }, { fill: fillContactsOfUser });
    expect(report.problems).toEqual(expected);
  });

  it("reports the error of a failing migration when it is expected, and finds nothing damaged after a rollback", async () => {
    const report = await checkMigration(
      { sql: `DO $$ BEGIN RAISE EXCEPTION 'boom from the migration'; END $$;` },
      { fill: fillContactsOfUser, expectError: true },
    );
    expect(report.error).toMatch(/boom from the migration/);
    expect(report.problems).toEqual([]);
  });

  it("passes the owner email to the migration's connection", async () => {
    const report = await checkMigration(
      {
        sql: `CREATE TABLE "probe" AS SELECT current_setting('app.owner_email', true) AS "value";`,
      },
      {
        fill: fillContactsOfUser,
        ownerEmail: " Some@Example.COM ",
        inspect: async (pool) => (await pool.query("select value from probe")).rows[0].value,
      },
    );
    expect(report.inspected).toBe(" Some@Example.COM ");
  });

  it("raises the error of a failing migration when it is not expected", async () => {
    await expect(
      checkMigration(
        { sql: `DO $$ BEGIN RAISE EXCEPTION 'unexpected'; END $$;` },
        { fill: fillContactsOfUser },
      ),
    ).rejects.toThrow();
  });

  it("does not raise a false alarm for a harmless new column and table", async () => {
    const report = await checkMigration(
      {
        sql: `ALTER TABLE "contacts" ADD COLUMN "nickname" text; CREATE TABLE "tags" ("id" uuid PRIMARY KEY);`,
      },
      { fill: fillContactsOfUser },
    );
    expect(report.problems).toEqual([]);
    expect(report.newColumns).toEqual({ contacts: ["nickname"] });
    expect(report.newTables).toEqual(["tags"]);
  });

  it("does not raise a false alarm for a new column with a default value", async () => {
    const report = await checkMigration(
      { sql: `ALTER TABLE "contacts" ADD COLUMN "archived" boolean NOT NULL DEFAULT false;` },
      {
        fill: fillContactsOfUser,
        inspect: (pool) =>
          count(pool, "select count(*)::int as n from contacts where archived = false"),
      },
    );
    expect(report.problems).toEqual([]);
    expect(report.newColumns).toEqual({ contacts: ["archived"] });
    expect(report.inspected).toBe(4);
  });
});
