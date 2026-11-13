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

async function withPool<T>(database: string | null, run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: urlFor(database), max: 1 });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

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
};

type MigrationReport = {
  rowsBefore: Record<string, number>;
  problems: string[];
  newTables: string[];
  newColumns: Record<string, string[]>;
  inspected: unknown;
};

const EXTRA_TAG = "9999_extra";

// `target` is a tag from the journal, or SQL appended as an extra latest migration (the self-check)
async function checkMigration(
  target: { tag: string } | { sql: string },
  { fill, inspect }: Check,
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
  const apply = (folder: string) =>
    withPool(database, (pool) => migrate(drizzle({ client: pool }), { migrationsFolder: folder }));

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

    await apply(afterFolder);
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

async function fillContactsWithCadence(pool: Pool) {
  await pool.query(`
    insert into contacts (name, about, how_we_met, phone, email, cadence, contact_on, created_at) values
      ('Анна Тестова', 'Дизайнер', 'Курсы', '+7 (000) 111-11-11', 'anna@example.com', 'week', null, now() - interval '30 days'),
      ('Борис Пробный', null, null, null, null, null, null, now() - interval '400 days'),
      ('Вера Ёлкина', 'Соседка', 'Соседи по дому', null, 'vera@example.org', 'date', current_date + 10, now() - interval '5 days'),
      ('Глеб Выдуманный', 'Однокурсник', null, '+7 (000) 222-22-22', null, 'year', null, now() - interval '2 days')
  `);
  await fillNotes(pool);
}

async function fillNotes(pool: Pool) {
  await pool.query(`
    insert into notes (contact_id, body, created_at)
    select id, 'Созвонились по поводу ремонта', now() - interval '3 days' from contacts where name in ('Анна Тестова', 'Вера Ёлкина')
    union all
    select id, 'Поздравить с днём рождения', now() - interval '1 day' from contacts where name = 'Анна Тестова'
  `);
}

// One test per migration from the journal; the first one runs on an empty database and has none
const CHECKED_MIGRATIONS = ["0001_unique_rachel_grey", "0002_gorgeous_magdalene"];

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
      `INSERT INTO "contacts" ("name") VALUES ('Лишний');`,
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
    const report = await checkMigration({ sql }, { fill: fillContactsWithCadence });
    expect(report.problems).toEqual(expected);
  });

  it("does not raise a false alarm for a harmless new column and table", async () => {
    const report = await checkMigration(
      {
        sql: `ALTER TABLE "contacts" ADD COLUMN "nickname" text; CREATE TABLE "tags" ("id" uuid PRIMARY KEY);`,
      },
      { fill: fillContactsWithCadence },
    );
    expect(report.problems).toEqual([]);
    expect(report.newColumns).toEqual({ contacts: ["nickname"] });
    expect(report.newTables).toEqual(["tags"]);
  });

  it("does not raise a false alarm for a new column with a default value", async () => {
    const report = await checkMigration(
      { sql: `ALTER TABLE "contacts" ADD COLUMN "archived" boolean NOT NULL DEFAULT false;` },
      {
        fill: fillContactsWithCadence,
        inspect: (pool) =>
          count(pool, "select count(*)::int as n from contacts where archived = false"),
      },
    );
    expect(report.problems).toEqual([]);
    expect(report.newColumns).toEqual({ contacts: ["archived"] });
    expect(report.inspected).toBe(4);
  });
});
