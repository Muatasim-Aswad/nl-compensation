import type { Money } from "@nl-compensation/core";
import { EMPLOYMENT_2026, EMPLOYMENT_2026_RULE_ID } from "../rules/employment-2026.js";
import type { Fraction } from "../support/rational.js";
import { floorToInteger, frac, fromInt, percentageOf, sub } from "../support/rational.js";
import type { RuleOutcome } from "../support/result.js";
import { centsToMoney, supported } from "../support/result.js";

/** Statutory minimum holiday allowance: 8% of the gross annual salary. */
export function statutoryHolidayAllowance(
  grossAnnualSalary: Money,
  rule = EMPLOYMENT_2026,
): RuleOutcome<Money> {
  const amount = percentageOf(
    fromInt(grossAnnualSalary.amountCents),
    rule.parameters.statutoryHolidayAllowanceRatePpm,
  );
  return supported("exact", centsToMoney(floorToInteger(amount)), {
    ruleIds: [EMPLOYMENT_2026_RULE_ID],
    trace: [
      {
        id: "statutory-holiday-allowance",
        operation: "percentage_of_gross_annual_salary",
        inputPaths: ["employerPackage.grossAnnualSalary"],
        outputPath: "normalization.guaranteedBreakdown.holidayAllowance",
        ruleId: EMPLOYMENT_2026_RULE_ID,
        rounding: "truncated to cents",
      },
    ],
  });
}

/** Statutory paid leave: four times the weekly working hours per year. */
export function statutoryLeaveHoursPerYear(
  weeklyHours: Fraction,
  rule = EMPLOYMENT_2026,
): Fraction {
  return frac(
    weeklyHours.n * BigInt(rule.parameters.statutoryLeaveHoursPerWeeklyHour),
    weeklyHours.d,
  );
}

export interface CaoRijkIkbDecomposition {
  readonly annualBudget: Money;
  /** The 8% holiday allowance already contained in the budget. */
  readonly containedHolidayAllowance: Money;
  /** The budget beyond the contained holiday allowance. */
  readonly remainingBudget: Money;
  readonly minimumMonthlyBudget: Money;
  readonly holidayAllowanceMustNotBeAddedSeparately: boolean;
}

/**
 * Splits a CAO Rijk IKB budget into the holiday allowance it already contains
 * and the rest.
 *
 * The IKB budget is 16,50% of salary and the 8% vakantie-uitkering sits inside
 * it. Adding a separate 8% holiday allowance on top of an IKB budget therefore
 * double counts, which is the case this decomposition exists to prevent.
 */
export function decomposeCaoRijkIkb(
  grossAnnualSalary: Money,
  rule = EMPLOYMENT_2026,
): RuleOutcome<CaoRijkIkbDecomposition> {
  const ikb = rule.parameters.caoRijkIkb;
  const salary = fromInt(grossAnnualSalary.amountCents);
  const budget = percentageOf(salary, ikb.budgetRateOfSalaryPpm);
  const contained = percentageOf(salary, ikb.includedHolidayAllowanceRatePpm);

  return supported(
    "exact",
    {
      annualBudget: centsToMoney(floorToInteger(budget)),
      containedHolidayAllowance: centsToMoney(floorToInteger(contained)),
      remainingBudget: centsToMoney(floorToInteger(sub(budget, contained))),
      minimumMonthlyBudget: centsToMoney(BigInt(ikb.minimumBudgetPerMonthCents)),
      holidayAllowanceMustNotBeAddedSeparately: ikb.includesHolidayAllowance,
    },
    {
      ruleIds: [EMPLOYMENT_2026_RULE_ID],
      assumptions: [
        {
          code: "nl_cao_rijk_ikb_composition",
          message:
            "The CAO Rijk IKB budget is 16,50% of salary and already contains the 8% vakantie-uitkering, so a separate holiday allowance is not added.",
          affectedPaths: ["normalization.guaranteedBreakdown"],
        },
      ],
      trace: [
        {
          id: "cao-rijk-ikb-decomposition",
          operation: "split_ikb_budget",
          inputPaths: ["employerPackage.grossAnnualSalary"],
          outputPath: "normalization.guaranteedBreakdown.ikb",
          ruleId: EMPLOYMENT_2026_RULE_ID,
          rounding: "truncated to cents",
        },
      ],
    },
  );
}
