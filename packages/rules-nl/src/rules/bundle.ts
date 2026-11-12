import type { RuleDefinition, RuleSelection } from "@nl-compensation/core";
import { contentHashOf } from "../support/hash.js";
import { EMPLOYMENT_2026 } from "./employment-2026.js";
import { HUURTOESLAG_2026 } from "./huurtoeslag-2026.js";
import { INCOME_TAX_2026 } from "./income-tax-2026.js";
import { PAYROLL_2026 } from "./payroll-2026.js";
import { REIMBURSEMENTS_2026 } from "./reimbursements-2026.js";
import { ZORGTOESLAG_2026 } from "./zorgtoeslag-2026.js";

export interface RuleBundle {
  readonly id: string;
  readonly calendarYear: number;
  readonly contentHash: string;
  readonly employment: typeof EMPLOYMENT_2026;
  readonly incomeTax: typeof INCOME_TAX_2026;
  readonly payroll: typeof PAYROLL_2026;
  readonly zorgtoeslag: typeof ZORGTOESLAG_2026;
  readonly huurtoeslag: typeof HUURTOESLAG_2026;
  readonly reimbursements: typeof REIMBURSEMENTS_2026;
}

export const BUNDLE_2026_ID = "nl-2026-b3";

const currentMembers: readonly RuleDefinition<unknown>[] = [
  EMPLOYMENT_2026,
  INCOME_TAX_2026,
  PAYROLL_2026,
  ZORGTOESLAG_2026,
  HUURTOESLAG_2026,
  REIMBURSEMENTS_2026,
];

const bundleContentHash = (id: string, rules: readonly RuleDefinition<unknown>[]): string =>
  contentHashOf({
    id,
    calendarYear: 2026,
    rules: [...rules]
      .map((rule) => ({ id: rule.id, contentHash: rule.contentHash }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
  });

export const BUNDLE_2026: RuleBundle = {
  id: BUNDLE_2026_ID,
  calendarYear: 2026,
  contentHash: bundleContentHash(BUNDLE_2026_ID, currentMembers),
  employment: EMPLOYMENT_2026,
  incomeTax: INCOME_TAX_2026,
  payroll: PAYROLL_2026,
  zorgtoeslag: ZORGTOESLAG_2026,
  huurtoeslag: HUURTOESLAG_2026,
  reimbursements: REIMBURSEMENTS_2026,
};

/** The `RuleSelection` a report must record so the calculation stays reproducible. */
export function ruleSelectionFor(bundle: RuleBundle): RuleSelection {
  const rules: readonly RuleDefinition<unknown>[] = [
    bundle.employment,
    bundle.incomeTax,
    bundle.payroll,
    bundle.zorgtoeslag,
    bundle.huurtoeslag,
    bundle.reimbursements,
  ];
  return {
    bundleId: bundle.id,
    bundleContentHash: bundle.contentHash,
    ruleIds: rules.map((rule) => rule.id),
    ruleContentHashes: Object.fromEntries(rules.map((rule) => [rule.id, rule.contentHash])),
  };
}

export function findRuleById(id: string): RuleDefinition<unknown> | undefined {
  return currentMembers.find((rule) => rule.id === id);
}
