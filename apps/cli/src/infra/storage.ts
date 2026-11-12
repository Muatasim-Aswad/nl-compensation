import {
  parseCompensationCase,
  parseStoredCase,
  type CompensationCaseInput,
  type StoredCase,
} from "@nl-compensation/core";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { StoragePaths } from "../config/storage.js";
import { AppError } from "../shared/errors.js";
import { transaction, withDatabase } from "./database.js";
export type { StoredCase } from "@nl-compensation/core";

export interface Revisioned<T> {
  readonly revision: string;
  readonly value: T;
}
export interface WriteOptions {
  readonly expectedRevision?: string | null;
  readonly mutationId?: string;
  readonly fingerprint?: string;
  readonly beforeCommit?: () => void;
}
interface StoredRecord<T> extends Revisioned<T> {
  readonly mutationId?: string;
  readonly fingerprint?: string;
}
type Resource = "profile" | "case";
type ResourceValue = CompensationCaseInput | StoredCase;

const CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function validateCaseId(caseId: string): string {
  if (!CASE_ID.test(caseId))
    throw new AppError(
      "usage_error",
      "Case ID must contain only letters, digits, dot, underscore, or hyphen.",
    );
  return caseId;
}

function readResource(
  database: DatabaseSync,
  resource: Resource,
  id: string,
): StoredRecord<ResourceValue> | undefined {
  const row =
    resource === "profile"
      ? database
          .prepare(
            "SELECT revision, input_json, mutation_id, fingerprint FROM profiles WHERE id = ?",
          )
          .get(id)
      : database
          .prepare(`SELECT c.revision, c.input_json, c.mutation_id, c.fingerprint,
        r.schema_version, r.engine_version, r.calculated_at, r.selected_rules_json, r.source_observations_json, r.report_json
        FROM cases c LEFT JOIN reports r ON r.case_id = c.id WHERE c.id = ?`)
          .get(id);
  if (!row) return undefined;
  const input = parseCompensationCase(JSON.parse(row.input_json as string));
  const value =
    resource === "profile"
      ? input
      : parseStoredCase({
          schemaVersion: row.schema_version,
          engineVersion: row.engine_version,
          calculatedAt: row.calculated_at,
          selectedRules: JSON.parse(row.selected_rules_json as string),
          sourceObservations: JSON.parse(row.source_observations_json as string),
          input,
          report: JSON.parse(row.report_json as string),
        });
  return {
    revision: row.revision as string,
    value,
    mutationId: row.mutation_id as string | undefined,
    fingerprint: row.fingerprint as string | undefined,
  };
}

async function readRecord<T extends ResourceValue>(
  paths: StoragePaths,
  resource: Resource,
  id: string,
): Promise<Revisioned<T> | undefined> {
  const record = await withDatabase(paths, false, (database) =>
    readResource(database, resource, id),
  );
  return record ? { revision: record.revision, value: record.value as T } : undefined;
}

function writeResource(
  database: DatabaseSync,
  resource: Resource,
  id: string,
  record: StoredRecord<ResourceValue>,
  changedAt?: string,
): void {
  const table = resource === "profile" ? "profiles" : "cases";
  const input =
    resource === "profile"
      ? (record.value as CompensationCaseInput)
      : (record.value as StoredCase).input;
  database
    .prepare(`INSERT INTO ${table} (id, revision, input_json, mutation_id, fingerprint) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, input_json = excluded.input_json,
      mutation_id = excluded.mutation_id, fingerprint = excluded.fingerprint`)
    .run(
      id,
      record.revision,
      JSON.stringify(input),
      record.mutationId ?? null,
      record.fingerprint ?? null,
    );
  if (resource === "case") {
    const saved = record.value as StoredCase;
    database
      .prepare(`INSERT INTO reports (case_id, schema_version, engine_version, calculated_at, selected_rules_json, source_observations_json, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET schema_version = excluded.schema_version,
      engine_version = excluded.engine_version, calculated_at = excluded.calculated_at, selected_rules_json = excluded.selected_rules_json,
      source_observations_json = excluded.source_observations_json, report_json = excluded.report_json`)
      .run(
        id,
        saved.schemaVersion,
        saved.engineVersion,
        saved.calculatedAt,
        JSON.stringify(saved.selectedRules),
        JSON.stringify(saved.sourceObservations),
        JSON.stringify(saved.report),
      );
  } else {
    database
      .prepare(
        "INSERT INTO profile_history (profile_id, changed_at, revision) VALUES ('default', ?, ?)",
      )
      .run(changedAt!, record.revision);
    database.exec(
      "DELETE FROM profile_history WHERE sequence NOT IN (SELECT sequence FROM profile_history ORDER BY sequence DESC LIMIT 100)",
    );
  }
}

async function replaceRecord<T extends ResourceValue>(
  paths: StoragePaths,
  resource: Resource,
  id: string,
  value: T,
  options: WriteOptions,
  changedAt?: string,
): Promise<Revisioned<T>> {
  const observed = await readRecord(paths, resource, id);
  const expected =
    options.expectedRevision === undefined
      ? (observed?.revision ?? null)
      : options.expectedRevision;
  const result = await withDatabase(paths, true, (database) =>
    transaction(database, () => {
      const current = readResource(database, resource, id);
      const fingerprint = createHash("sha256")
        .update(options.fingerprint ?? JSON.stringify(value))
        .digest("hex");
      if (options.mutationId && current?.mutationId === options.mutationId) {
        if (current.fingerprint === fingerprint)
          return { revision: current.revision, value: current.value as T };
        throw new AppError(
          "conflict",
          "This mutation ID has already been used for different content.",
          { currentRevision: current.revision },
        );
      }
      if (current && JSON.stringify(current.value) === JSON.stringify(value))
        return { revision: current.revision, value: current.value as T };
      if ((current?.revision ?? null) !== expected)
        throw new AppError("conflict", "The saved data changed. Reload it before saving again.", {
          currentRevision: current?.revision ?? null,
        });
      const record = {
        revision: randomUUID(),
        value,
        mutationId: options.mutationId,
        fingerprint: options.mutationId ? fingerprint : undefined,
      };
      writeResource(database, resource, id, record, changedAt);
      options.beforeCommit?.();
      return { revision: record.revision, value };
    }),
  );
  return result!;
}

export async function readProfileRecord(
  paths: StoragePaths,
): Promise<Revisioned<CompensationCaseInput> | undefined> {
  return readRecord(paths, "profile", "default");
}
export async function readProfile(paths: StoragePaths): Promise<CompensationCaseInput | undefined> {
  return (await readProfileRecord(paths))?.value;
}
export async function writeProfileRecord(
  paths: StoragePaths,
  raw: unknown,
  changedAt: string,
  options: WriteOptions = {},
): Promise<Revisioned<CompensationCaseInput>> {
  return replaceRecord(
    paths,
    "profile",
    "default",
    parseCompensationCase(raw, "profile"),
    options,
    changedAt,
  );
}
export async function writeProfile(
  paths: StoragePaths,
  raw: unknown,
  changedAt: string,
  options: WriteOptions = {},
): Promise<CompensationCaseInput> {
  return (await writeProfileRecord(paths, raw, changedAt, options)).value;
}

export async function saveCaseRecord(
  paths: StoragePaths,
  caseId: string,
  saved: StoredCase,
  options: WriteOptions = {},
): Promise<Revisioned<StoredCase>> {
  return replaceRecord(paths, "case", validateCaseId(caseId), parseStoredCase(saved), options);
}
export async function saveCase(
  paths: StoragePaths,
  caseId: string,
  saved: StoredCase,
  options: WriteOptions = {},
): Promise<string> {
  return (await saveCaseRecord(paths, caseId, saved, options)).revision;
}
export async function readCaseRecord(
  paths: StoragePaths,
  caseId: string,
): Promise<Revisioned<StoredCase> | undefined> {
  return readRecord(paths, "case", validateCaseId(caseId));
}
export async function readCase(
  paths: StoragePaths,
  caseId: string,
): Promise<StoredCase | undefined> {
  return (await readCaseRecord(paths, caseId))?.value;
}
export async function listCases(paths: StoragePaths): Promise<readonly string[]> {
  return (
    (await withDatabase(paths, false, (database) =>
      database
        .prepare("SELECT id FROM cases ORDER BY id COLLATE BINARY")
        .all()
        .map((row) => row.id as string),
    )) ?? []
  );
}
export function sourceObservationIds(input: CompensationCaseInput): readonly string[] {
  const serialized = JSON.stringify(input);
  const ids = new Set<string>();
  JSON.parse(serialized, (key: string, value: unknown) => {
    if (
      key === "source" &&
      typeof value === "object" &&
      value !== null &&
      "id" in value &&
      typeof (value as { id?: unknown }).id === "string"
    ) {
      ids.add((value as { id: string }).id);
    }
    return value;
  });
  return [...ids].sort();
}
