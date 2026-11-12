import type { RuleDefinition, RuleSelection, RuleSource } from "../model/rules.js";
import { array, ContractValidationError, record, string, type Parser } from "./validation.js";

const parseString: Parser<string> = (input, path = "value") => string(input, path);

const parseRuleSource: Parser<RuleSource> = (input, path = "ruleSource") => {
  const value = record(input, path);
  return {
    title: string(value.title, `${path}.title`),
    url: string(value.url, `${path}.url`),
    publicationDate:
      value.publicationDate === undefined
        ? undefined
        : string(value.publicationDate, `${path}.publicationDate`),
    effectiveFrom: string(value.effectiveFrom, `${path}.effectiveFrom`),
    effectiveTo:
      value.effectiveTo === undefined
        ? undefined
        : string(value.effectiveTo, `${path}.effectiveTo`),
    checkedAt: string(value.checkedAt, `${path}.checkedAt`),
    contentHash: string(value.contentHash, `${path}.contentHash`),
  };
};

export function parseRuleDefinition<T>(
  input: unknown,
  parseParameters: Parser<T>,
  path = "rule",
): RuleDefinition<T> {
  const value = record(input, path);
  if (value.schemaVersion !== "1") {
    throw new ContractValidationError([
      { path: `${path}.schemaVersion`, code: "version", message: "expected schema version 1" },
    ]);
  }
  return {
    schemaVersion: "1",
    id: string(value.id, `${path}.id`),
    legalFrom: string(value.legalFrom, `${path}.legalFrom`),
    legalTo: value.legalTo === undefined ? undefined : string(value.legalTo, `${path}.legalTo`),
    effectiveFrom: string(value.effectiveFrom, `${path}.effectiveFrom`),
    effectiveTo:
      value.effectiveTo === undefined
        ? undefined
        : string(value.effectiveTo, `${path}.effectiveTo`),
    publishedAt:
      value.publishedAt === undefined
        ? undefined
        : string(value.publishedAt, `${path}.publishedAt`),
    verifiedAt: string(value.verifiedAt, `${path}.verifiedAt`),
    sources: array(value.sources, parseRuleSource, `${path}.sources`),
    contentHash: string(value.contentHash, `${path}.contentHash`),
    parameters: parseParameters(value.parameters, `${path}.parameters`),
  };
}

export function parseRuleSelection(input: unknown, path = "rules"): RuleSelection {
  const value = record(input, path);
  const hashes = record(value.ruleContentHashes, `${path}.ruleContentHashes`);
  return {
    bundleId: string(value.bundleId, `${path}.bundleId`),
    bundleContentHash: string(value.bundleContentHash, `${path}.bundleContentHash`),
    ruleIds: array(value.ruleIds, parseString, `${path}.ruleIds`),
    ruleContentHashes: Object.fromEntries(
      Object.entries(hashes).map(([key, item]) => [
        key,
        string(item, `${path}.ruleContentHashes.${key}`),
      ]),
    ),
  };
}
