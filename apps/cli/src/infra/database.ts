import { chmod, mkdir, open, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { StoragePaths } from "../config/storage.js";
import { AppError, systemErrorCode } from "../shared/errors.js";

const APPLICATION_ID = 0x4e4c434d;
const SCHEMA_VERSION = 1;

const schema = `
CREATE TABLE profiles (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  revision TEXT NOT NULL UNIQUE CHECK (length(revision) > 0),
  input_json TEXT NOT NULL CHECK (json_valid(input_json) AND json_extract(input_json, '$.schemaVersion') IS '1'),
  mutation_id TEXT,
  fingerprint TEXT,
  CHECK ((mutation_id IS NULL) = (fingerprint IS NULL))
) STRICT;
CREATE TABLE cases (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128 AND id GLOB '[A-Za-z0-9]*' AND id NOT GLOB '*[^A-Za-z0-9._-]*'),
  revision TEXT NOT NULL UNIQUE CHECK (length(revision) > 0),
  input_json TEXT NOT NULL CHECK (json_valid(input_json) AND json_extract(input_json, '$.schemaVersion') IS '1'),
  mutation_id TEXT,
  fingerprint TEXT,
  CHECK ((mutation_id IS NULL) = (fingerprint IS NULL))
) STRICT;
CREATE TABLE reports (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL CHECK (schema_version = '1'),
  engine_version TEXT NOT NULL CHECK (length(engine_version) > 0),
  calculated_at TEXT NOT NULL CHECK (length(calculated_at) > 0),
  selected_rules_json TEXT NOT NULL CHECK (json_valid(selected_rules_json) AND json_type(selected_rules_json) = 'object'),
  source_observations_json TEXT NOT NULL CHECK (json_valid(source_observations_json) AND json_type(source_observations_json) = 'array'),
  report_json TEXT NOT NULL CHECK (json_valid(report_json) AND json_extract(report_json, '$.schemaVersion') IS '1')
) STRICT;
CREATE TABLE profile_history (
  sequence INTEGER PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE CHECK (profile_id = 'default'),
  changed_at TEXT NOT NULL CHECK (length(changed_at) > 0),
  revision TEXT NOT NULL UNIQUE CHECK (length(revision) > 0)
) STRICT;
`;

function databaseIdentity(database: DatabaseSync): { applicationId: number; version: number } {
  const applicationId = database.prepare("PRAGMA application_id").get()!.application_id as number;
  const version = database.prepare("PRAGMA user_version").get()!.user_version as number;
  return { applicationId, version };
}

function requireCurrentSchema(database: DatabaseSync): void {
  const identity = databaseIdentity(database);
  if (identity.applicationId !== APPLICATION_ID || identity.version !== SCHEMA_VERSION) {
    throw new AppError(
      "storage_error",
      "The database does not use the current NL Compensation schema.",
    );
  }
}

function isEmptyDatabase(database: DatabaseSync): boolean {
  const identity = databaseIdentity(database);
  return (
    identity.applicationId === 0 &&
    identity.version === 0 &&
    database
      .prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
      .get()!.count === 0
  );
}

function initializeDatabase(database: DatabaseSync): void {
  transaction(database, () => {
    if (isEmptyDatabase(database)) {
      database.exec(schema);
      database.exec(
        `PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${SCHEMA_VERSION}`,
      );
    }
    requireCurrentSchema(database);
  });
  database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL");
}

export function transaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* Closing the connection also rolls back an unfinished transaction. */
    }
    throw error;
  }
}

function storageError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "errcode" in error &&
    [5, 6].includes(Number(error.errcode) & 0xff)
  ) {
    return new AppError("busy", "The local database is busy. Try again shortly.", undefined, {
      cause: error,
    });
  }
  return new AppError("storage_error", "Saved data could not be accessed.", undefined, {
    cause: error,
  });
}

export async function withDatabase<T>(
  paths: StoragePaths,
  write: boolean,
  work: (database: DatabaseSync) => T,
): Promise<T | undefined> {
  let database: DatabaseSync | undefined;
  try {
    if (write) {
      const directory = path.dirname(paths.database);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      try {
        const handle = await open(paths.database, "wx", 0o600);
        await handle.close();
      } catch (error) {
        if (systemErrorCode(error) !== "EEXIST") throw error;
      }
      await chmod(paths.database, 0o600);
    } else {
      try {
        await stat(paths.database);
      } catch (error) {
        if (systemErrorCode(error) === "ENOENT") return undefined;
        throw error;
      }
    }
    database = new DatabaseSync(paths.database, {
      readOnly: !write,
      enableForeignKeyConstraints: true,
    });
    database.exec("PRAGMA busy_timeout = 1000");
    if (write) initializeDatabase(database);
    else {
      if (isEmptyDatabase(database)) return undefined;
      requireCurrentSchema(database);
    }
    return work(database);
  } catch (error) {
    throw storageError(error);
  } finally {
    database?.close();
  }
}
