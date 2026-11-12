import type { Parser, RuleDefinition } from "@nl-compensation/core";
import { record } from "@nl-compensation/core";
import { SOURCE_KILOMETRE_ALLOWANCE } from "../provenance/sources.js";
import { bool, defineRule, int } from "./define.js";

export interface ReimbursementRuleParameters {
  readonly untaxedKilometreAllowanceCentsPerKilometre: number;
  readonly previousUntaxedKilometreAllowanceCentsPerKilometre: number;
  readonly increaseAppliedRetroactivelyFromStartOfYear: boolean;
  readonly countsTowardGuaranteedAnnualCash: boolean;
}

const parseParameters: Parser<ReimbursementRuleParameters> = (input, path = "parameters") => {
  const value = record(input, path);
  return {
    untaxedKilometreAllowanceCentsPerKilometre: int(
      value,
      "untaxedKilometreAllowanceCentsPerKilometre",
      path,
    ),
    previousUntaxedKilometreAllowanceCentsPerKilometre: int(
      value,
      "previousUntaxedKilometreAllowanceCentsPerKilometre",
      path,
    ),
    increaseAppliedRetroactivelyFromStartOfYear: bool(
      value,
      "increaseAppliedRetroactivelyFromStartOfYear",
      path,
    ),
    countsTowardGuaranteedAnnualCash: bool(value, "countsTowardGuaranteedAnnualCash", path),
  };
};

export const REIMBURSEMENTS_2026_RULE_ID = "nl-reimbursements-2026-r2";

/**
 * Reimbursement rules for 2026.
 *
 * The untaxed kilometre allowance is € 0,25 per kilometre, raised from € 0,23
 * with retroactive effect to 1 January 2026. An employer who reimbursed € 0,23
 * or less may pay the € 0,02 difference untaxed with a later wage payment; an
 * employer who already treated the excess as wage corrects earlier returns by
 * € 0,02 per kilometre per period. This is the worked example of a mid-year
 * revision: the value changed, so it is a new rule revision rather than an
 * edit of an existing one.
 *
 * Reimbursements repay costs and never enter Guaranteed Annual Cash.
 */
export const REIMBURSEMENTS_2026: RuleDefinition<ReimbursementRuleParameters> = defineRule(
  {
    id: REIMBURSEMENTS_2026_RULE_ID,
    legalFrom: "2026-01-01",
    legalTo: "2026-12-31",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    verifiedAt: "2026-11-12",
    sources: [SOURCE_KILOMETRE_ALLOWANCE],
  },
  {
    untaxedKilometreAllowanceCentsPerKilometre: 25,
    previousUntaxedKilometreAllowanceCentsPerKilometre: 23,
    increaseAppliedRetroactivelyFromStartOfYear: true,
    countsTowardGuaranteedAnnualCash: false,
  } satisfies ReimbursementRuleParameters,
  parseParameters,
);
