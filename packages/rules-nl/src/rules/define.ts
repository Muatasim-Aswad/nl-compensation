import type { Parser, RuleDefinition, RuleSource } from "@nl-compensation/core";
import {
  ContractValidationError,
  integer,
  parseRuleDefinition,
  record,
} from "@nl-compensation/core";
import type { CanonicalJson } from "../support/hash.js";
import { contentHashOf } from "../support/hash.js";

/** Rule parameters are plain JSON data; this states that structural fact for the hasher. */
const toCanonical = (value: unknown): CanonicalJson =>
  JSON.parse(JSON.stringify(value)) as CanonicalJson;

export interface RuleIdentity {
  readonly id: string;
  readonly legalFrom: string;
  readonly legalTo?: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly publishedAt?: string;
  readonly verifiedAt: string;
  readonly sources: readonly RuleSource[];
}

/**
 * Builds an immutable rule definition.
 *
 * The content hash covers the identity and the parameters, so any change to a
 * constant, bound, or source list changes the hash. Pinned hash tests then fail
 * until a new rule ID is minted, which is how mutation-in-place is prevented.
 *
 * The definition is serialized and re-parsed through the public core contract
 * so a malformed rule fails at module load rather than mid-calculation.
 */
export function defineRule<T>(
  identity: RuleIdentity,
  parameters: T,
  parseParameters: Parser<T>,
): RuleDefinition<T> {
  if (identity.sources.length === 0) {
    throw new ContractValidationError([
      {
        path: `rule ${identity.id}.sources`,
        code: "empty",
        message: "at least one source is required",
      },
    ]);
  }

  const raw = {
    schemaVersion: "1",
    ...identity,
    contentHash: contentHashOf({
      id: identity.id,
      legalFrom: identity.legalFrom,
      legalTo: identity.legalTo ?? null,
      effectiveFrom: identity.effectiveFrom,
      effectiveTo: identity.effectiveTo ?? null,
      sources: identity.sources.map((source) => ({
        title: source.title,
        url: source.url,
        publicationDate: source.publicationDate ?? null,
        effectiveFrom: source.effectiveFrom,
        effectiveTo: source.effectiveTo ?? null,
        contentHash: source.contentHash,
      })),
      parameters: toCanonical(parameters),
    }),
    parameters,
  };

  return parseRuleDefinition(
    JSON.parse(JSON.stringify(raw)),
    parseParameters,
    `rule ${identity.id}`,
  );
}

/** Reads a required integer field. */
export const int = (value: Record<string, unknown>, key: string, path: string): number =>
  integer(value[key], `${path}.${key}`);

/** Reads an integer field that may be `null` to mean "no upper bound". */
export function nullableInt(
  value: Record<string, unknown>,
  key: string,
  path: string,
): number | null {
  return value[key] === null ? null : integer(value[key], `${path}.${key}`);
}

export function bool(value: Record<string, unknown>, key: string, path: string): boolean {
  if (typeof value[key] !== "boolean") {
    throw new ContractValidationError([
      { path: `${path}.${key}`, code: "type", message: "expected a boolean" },
    ]);
  }
  return value[key];
}

export function subRecord(
  value: Record<string, unknown>,
  key: string,
  path: string,
): Record<string, unknown> {
  return record(value[key], `${path}.${key}`);
}

/**
 * Asserts that a table's rows are ordered by a strictly increasing lower bound
 * starting at zero, which every lookup in this package relies on.
 */
export function assertAscendingFrom<T>(
  rows: readonly T[],
  lowerBound: (row: T) => number,
  path: string,
): readonly T[] {
  if (rows.length === 0) {
    throw new ContractValidationError([
      { path, code: "empty", message: "expected at least one row" },
    ]);
  }
  if (lowerBound(rows[0]!) !== 0) {
    throw new ContractValidationError([
      { path: `${path}[0]`, code: "range", message: "the first row must start at zero" },
    ]);
  }
  for (let i = 1; i < rows.length; i += 1) {
    if (lowerBound(rows[i]!) <= lowerBound(rows[i - 1]!)) {
      throw new ContractValidationError([
        { path: `${path}[${i}]`, code: "order", message: "rows must ascend strictly" },
      ]);
    }
  }
  return rows;
}

/** Selects the last row whose lower bound does not exceed `value`. */
export function selectRow<T>(rows: readonly T[], lowerBound: (row: T) => number, value: number): T {
  let selected = rows[0] as T;
  for (const row of rows) {
    if (lowerBound(row) <= value) {
      selected = row;
    } else {
      break;
    }
  }
  return selected;
}
