import type { Money } from "@nl-compensation/core";
import { REIMBURSEMENTS_2026, REIMBURSEMENTS_2026_RULE_ID } from "../rules/reimbursements-2026.js";
import type { RuleOutcome } from "../support/result.js";
import { centsToMoney, supported } from "../support/result.js";

export interface KilometreReimbursementInput {
  readonly kilometres: number;
  /** What the employer actually pays per kilometre, in cents. */
  readonly paidCentsPerKilometre: number;
}

export interface KilometreReimbursementResult {
  readonly totalPaid: Money;
  readonly untaxedPortion: Money;
  /** The excess above the exempt rate, which is wage and therefore taxable. */
  readonly taxablePortion: Money;
  readonly exemptCentsPerKilometre: number;
  readonly countsTowardGuaranteedAnnualCash: boolean;
}

/**
 * Splits a kilometre reimbursement into its exempt and taxable parts.
 *
 * The exempt rate is € 0,25 per kilometre for 2026, raised from € 0,23 with
 * retroactive effect to 1 January 2026. A reimbursement repays a cost and never
 * enters Guaranteed Annual Cash, whether or not part of it is taxable.
 */
export function splitKilometreReimbursement(
  input: KilometreReimbursementInput,
  rule = REIMBURSEMENTS_2026,
): RuleOutcome<KilometreReimbursementResult> {
  const exemptRate = rule.parameters.untaxedKilometreAllowanceCentsPerKilometre;
  const kilometres = BigInt(Math.trunc(input.kilometres));
  const paid = kilometres * BigInt(input.paidCentsPerKilometre);
  const exemptPerKm = BigInt(Math.min(input.paidCentsPerKilometre, exemptRate));
  const untaxed = kilometres * exemptPerKm;

  return supported(
    "exact",
    {
      totalPaid: centsToMoney(paid),
      untaxedPortion: centsToMoney(untaxed),
      taxablePortion: centsToMoney(paid - untaxed),
      exemptCentsPerKilometre: exemptRate,
      countsTowardGuaranteedAnnualCash: rule.parameters.countsTowardGuaranteedAnnualCash,
    },
    {
      ruleIds: [REIMBURSEMENTS_2026_RULE_ID],
      trace: [
        {
          id: "kilometre-reimbursement",
          operation: "split_exempt_and_taxable",
          inputPaths: ["employerPackage.reimbursements"],
          outputPath: "nonCash.benefits.travel",
          ruleId: REIMBURSEMENTS_2026_RULE_ID,
          rounding: "exact in whole cents per kilometre",
        },
      ],
    },
  );
}
