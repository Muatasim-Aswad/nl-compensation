import type { Parser, RuleDefinition } from "@nl-compensation/core";
import { record } from "@nl-compensation/core";
import {
  SOURCE_CAO_RIJK_IKB,
  SOURCE_HOLIDAY_ALLOWANCE,
  SOURCE_STATUTORY_LEAVE,
} from "../provenance/sources.js";
import { bool, defineRule, int, subRecord } from "./define.js";

/**
 * Dutch employment defaults that are not tax rules: the statutory holiday
 * allowance, statutory paid leave, and one documented CAO whose Individueel
 * Keuzebudget already contains the holiday allowance.
 */
export interface EmploymentRuleParameters {
  readonly statutoryHolidayAllowanceRatePpm: number;
  readonly holidayAllowanceMinimumPaymentsPerYear: number;
  readonly holidayAllowanceWaiverMinimumWageMultiple: number;
  readonly minimumWagePercentageWhenAllowanceExcludedByCaoPpm: number;
  readonly statutoryLeaveWeeksPerYear: number;
  readonly statutoryLeaveHoursPerWeeklyHour: number;
  readonly caoRijkIkb: {
    readonly budgetRateOfSalaryPpm: number;
    readonly minimumBudgetPerMonthCents: number;
    readonly includesHolidayAllowance: boolean;
    readonly includedHolidayAllowanceRatePpm: number;
    readonly hoursPerYear: number;
  };
}

const parseParameters: Parser<EmploymentRuleParameters> = (input, path = "parameters") => {
  const value = record(input, path);
  const ikb = subRecord(value, "caoRijkIkb", path);
  return {
    statutoryHolidayAllowanceRatePpm: int(value, "statutoryHolidayAllowanceRatePpm", path),
    holidayAllowanceMinimumPaymentsPerYear: int(
      value,
      "holidayAllowanceMinimumPaymentsPerYear",
      path,
    ),
    holidayAllowanceWaiverMinimumWageMultiple: int(
      value,
      "holidayAllowanceWaiverMinimumWageMultiple",
      path,
    ),
    minimumWagePercentageWhenAllowanceExcludedByCaoPpm: int(
      value,
      "minimumWagePercentageWhenAllowanceExcludedByCaoPpm",
      path,
    ),
    statutoryLeaveWeeksPerYear: int(value, "statutoryLeaveWeeksPerYear", path),
    statutoryLeaveHoursPerWeeklyHour: int(value, "statutoryLeaveHoursPerWeeklyHour", path),
    caoRijkIkb: {
      budgetRateOfSalaryPpm: int(ikb, "budgetRateOfSalaryPpm", `${path}.caoRijkIkb`),
      minimumBudgetPerMonthCents: int(ikb, "minimumBudgetPerMonthCents", `${path}.caoRijkIkb`),
      includesHolidayAllowance: bool(ikb, "includesHolidayAllowance", `${path}.caoRijkIkb`),
      includedHolidayAllowanceRatePpm: int(
        ikb,
        "includedHolidayAllowanceRatePpm",
        `${path}.caoRijkIkb`,
      ),
      hoursPerYear: int(ikb, "hoursPerYear", `${path}.caoRijkIkb`),
    },
  };
};

export const EMPLOYMENT_2026_RULE_ID = "nl-employment-2026-r2";

/**
 * Holiday allowance: minimum 8% of the gross annual salary of the preceding
 * twelve months, paid at least once a year. Employees earning more than three
 * times the minimum wage may waive it in writing; where a CAO excludes it the
 * employee must still receive at least 108% of the minimum wage.
 *
 * Statutory paid leave: four times the weekly working hours per year.
 *
 * CAO Rijk: the IKB budget is 16,50% of salary with a current minimum of € 452
 * per month, and the 8% vakantie-uitkering is contained in that budget. This is
 * the reference case for holiday-pay double counting.
 */
export const EMPLOYMENT_2026: RuleDefinition<EmploymentRuleParameters> = defineRule(
  {
    id: EMPLOYMENT_2026_RULE_ID,
    legalFrom: "2026-01-01",
    legalTo: "2026-12-31",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    publishedAt: "2026-10-26",
    verifiedAt: "2026-11-12",
    sources: [SOURCE_HOLIDAY_ALLOWANCE, SOURCE_STATUTORY_LEAVE, SOURCE_CAO_RIJK_IKB],
  },
  {
    statutoryHolidayAllowanceRatePpm: 80_000,
    holidayAllowanceMinimumPaymentsPerYear: 1,
    holidayAllowanceWaiverMinimumWageMultiple: 3,
    minimumWagePercentageWhenAllowanceExcludedByCaoPpm: 1_080_000,
    statutoryLeaveWeeksPerYear: 4,
    statutoryLeaveHoursPerWeeklyHour: 4,
    caoRijkIkb: {
      budgetRateOfSalaryPpm: 165_000,
      minimumBudgetPerMonthCents: 45_200,
      includesHolidayAllowance: true,
      includedHolidayAllowanceRatePpm: 80_000,
      hoursPerYear: 64,
    },
  } satisfies EmploymentRuleParameters,
  parseParameters,
);
