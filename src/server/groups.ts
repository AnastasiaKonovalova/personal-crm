import { and, count, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contactGroups, groups } from "@/db/schema";
import { normalizeGroupName } from "@/lib/validation";
import { UUID_PATTERN, isUniqueViolation, safeWrite } from "@/server/db-errors";

// Data access for groups. Imported only by server components, server actions and scripts.
// Names come in already validated (groupNameSchema): trimmed, not empty, at most 50 characters.
// Every function takes the owner's id first and only sees that user's groups: a group of another
// user does not exist for it (null, false or "dropped", like a deleted one).

export const DUPLICATE_GROUP_ERROR = "Такая группа уже есть";

type Db = ReturnType<typeof getDb>;
// The database itself or a transaction: findOrCreateGroup runs inside contact saves
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type GroupWriteResult = { id: string } | { error: typeof DUPLICATE_GROUP_ERROR };

// Same expression as the unique index groups_user_name_normalized_idx (which is per user)
const normalizedNameSql = sql`lower(translate(${groups.name}, 'Ёё', 'Ее'))`;

// The unique index is the real check, so two tabs saving the same name at once still get the error
async function writeGroup(operation: string, run: () => Promise<{ id: string }[]>) {
  try {
    const [row] = await run();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: DUPLICATE_GROUP_ERROR } as const;
    }
    return safeWrite(operation, () => Promise.reject(error));
  }
}

// The user's groups by name ("ё" as "е", case ignored) with the number of contacts in each
export async function listGroups(userId: string) {
  const db = getDb();
  return db
    .select({ id: groups.id, name: groups.name, contactCount: count(contactGroups.contactId) })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .where(eq(groups.userId, userId))
    .groupBy(groups.id)
    .orderBy(normalizedNameSql, groups.id);
}

export async function createGroup(userId: string, name: string): Promise<GroupWriteResult> {
  const db = getDb();
  const result = await writeGroup("create group", () =>
    db.insert(groups).values({ userId, name }).returning({ id: groups.id }),
  );
  return result!;
}

// null when the user has no such group; renaming to its own name in another case is allowed
export async function renameGroup(
  userId: string,
  id: string,
  name: string,
): Promise<GroupWriteResult | null> {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  const db = getDb();
  const result = await writeGroup("rename group", () =>
    db
      .update(groups)
      .set({ name })
      .where(and(eq(groups.id, id), eq(groups.userId, userId)))
      .returning({ id: groups.id }),
  );
  return result ?? null;
}

// Memberships go away via ON DELETE CASCADE; the contacts stay
export async function deleteGroup(userId: string, id: string) {
  if (!UUID_PATTERN.test(id)) {
    return false;
  }
  const db = getDb();
  const deleted = await safeWrite("delete group", () =>
    db
      .delete(groups)
      .where(and(eq(groups.id, id), eq(groups.userId, userId)))
      .returning({ id: groups.id }),
  );
  return deleted.length > 0;
}

// "New group" in the contact form and the card: an existing name of this user is not an error, it is
// that group. For use inside a write that is already wrapped in safeWrite, e.g. a contact transaction.
export async function findOrCreateGroupIn(userId: string, executor: Executor, name: string) {
  await executor.insert(groups).values({ userId, name }).onConflictDoNothing();
  const [found] = await executor
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.userId, userId), sql`${normalizedNameSql} = ${normalizeGroupName(name)}`));
  return found.id;
}

export async function findOrCreateGroup(userId: string, name: string) {
  return safeWrite("find or create group", () => findOrCreateGroupIn(userId, getDb(), name));
}

// The user's existing groups among the given ids: ids of deleted groups from an old form and ids of
// other users' groups are dropped
export async function existingGroupIds(userId: string, executor: Executor, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await executor
    .select({ id: groups.id })
    .from(groups)
    .where(and(inArray(groups.id, ids), eq(groups.userId, userId)));
  return rows.map((row) => row.id);
}

// The group the list is filtered by; null for a malformed id, a deleted group or another user's group
export async function findGroup(userId: string, id: string | undefined) {
  if (!id || !UUID_PATTERN.test(id)) return null;
  const [found] = await getDb()
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)));
  return found ?? null;
}
