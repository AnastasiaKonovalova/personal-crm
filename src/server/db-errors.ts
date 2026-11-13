// Shared helpers for the data access modules in src/server

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNIQUE_VIOLATION = "23505";

export function postgresCode(error: unknown): string | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ("code" in current && typeof current.code === "string") {
      return current.code;
    }
  }
  return undefined;
}

export function isUniqueViolation(error: unknown) {
  return postgresCode(error) === UNIQUE_VIOLATION;
}

// Database errors carry the query parameters (contact fields, note text, group names) in their
// message and detail. Log only the operation and the Postgres error code, and rethrow without
// the cause, so personal data never reaches the logs.
export async function safeWrite<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`Database write failed: ${operation}`, { code: postgresCode(error) });
    throw new Error(`Failed to ${operation}`);
  }
}
