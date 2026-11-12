import type { Parser, RuleDefinition } from "@nl-compensation/core";
import { array, record, ContractValidationError } from "@nl-compensation/core";
import {
  SOURCE_FOUR_WEEK_WAGE_TABLE,
  SOURCE_LOONHEFFINGEN_ANNEX,
  SOURCE_MONTHLY_WAGE_TABLE,
  SOURCE_PAYROLL_CALCULATION_RULES,
  SOURCE_PAYROLL_TABLE_INDEX,
  SOURCE_SPECIAL_REMUNERATION_TABLE,
} from "../provenance/sources.js";
import { assertAscendingFrom, bool, defineRule, int } from "./define.js";

/**
 * One row of the witte tabel bijzondere beloningen, for employees below the
 * AOW age who live in the Netherlands.
 *
 * With the payroll tax credit applied the withholding percentage is
 * `standardRatePpm + creditOffsetRatePpm`; the offset is negative while a
 * credit is still building up and positive while it is being phased out.
 */
export interface SpecialRemunerationRow {
  readonly fromAnnualWageCents: number;
  readonly rateWithoutPayrollCreditPpm: number;
  readonly standardRatePpm: number;
  readonly creditOffsetRatePpm: number;
}

export interface PayrollRuleParameters {
  readonly specialRemunerationUnderAowAge: readonly SpecialRemunerationRow[];
  readonly maximumContributionWageAnnualCents: number;
  readonly employerHealthcareActRatePpm: number;
  readonly employeeHealthcareActWithholdingRatePpm: number;
  readonly periodTablesIncluded: true;
  readonly regularPeriodTable: RegularPeriodTableParameters;
}

/** Compact parameters that generate the binding monthly and four-week tables. */
export interface RegularPeriodTableParameters {
  readonly annualWageStepCents: number;
  readonly maximumAnnualTableWageCents: number;
  readonly maximumMonthlyTableWageCents: number;
  readonly maximumFourWeekTableWageCents: number;
  readonly topRatePpm: number;
}

const parseRow: Parser<SpecialRemunerationRow> = (input, path = "row") => {
  const value = record(input, path);
  return {
    fromAnnualWageCents: int(value, "fromAnnualWageCents", path),
    rateWithoutPayrollCreditPpm: int(value, "rateWithoutPayrollCreditPpm", path),
    standardRatePpm: int(value, "standardRatePpm", path),
    creditOffsetRatePpm: int(value, "creditOffsetRatePpm", path),
  };
};

const parseParameters: Parser<PayrollRuleParameters> = (input, path = "parameters") => {
  const value = record(input, path);
  if (!bool(value, "periodTablesIncluded", path)) {
    throw new ContractValidationError([
      {
        path: `${path}.periodTablesIncluded`,
        code: "unsupported",
        message: "the current payroll rule requires periodic wage tables",
      },
    ]);
  }
  const tablePath = `${path}.regularPeriodTable`;
  const table = record(value.regularPeriodTable, tablePath);
  const regularPeriodTable: RegularPeriodTableParameters = {
    annualWageStepCents: int(table, "annualWageStepCents", tablePath),
    maximumAnnualTableWageCents: int(table, "maximumAnnualTableWageCents", tablePath),
    maximumMonthlyTableWageCents: int(table, "maximumMonthlyTableWageCents", tablePath),
    maximumFourWeekTableWageCents: int(table, "maximumFourWeekTableWageCents", tablePath),
    topRatePpm: int(table, "topRatePpm", tablePath),
  };
  return {
    specialRemunerationUnderAowAge: assertAscendingFrom(
      array(
        value.specialRemunerationUnderAowAge,
        parseRow,
        `${path}.specialRemunerationUnderAowAge`,
      ),
      (row) => row.fromAnnualWageCents,
      `${path}.specialRemunerationUnderAowAge`,
    ),
    maximumContributionWageAnnualCents: int(value, "maximumContributionWageAnnualCents", path),
    employerHealthcareActRatePpm: int(value, "employerHealthcareActRatePpm", path),
    employeeHealthcareActWithholdingRatePpm: int(
      value,
      "employeeHealthcareActWithholdingRatePpm",
      path,
    ),
    periodTablesIncluded: true,
    regularPeriodTable,
  };
};

const specialRemunerationUnderAowAge: readonly SpecialRemunerationRow[] = [
  {
    fromAnnualWageCents: 0,
    rateWithoutPayrollCreditPpm: 357_500,
    standardRatePpm: 0,
    creditOffsetRatePpm: 0,
  },
  {
    fromAnnualWageCents: 1_135_800,
    rateWithoutPayrollCreditPpm: 357_500,
    standardRatePpm: 357_500,
    creditOffsetRatePpm: -83_200,
  },
  {
    fromAnnualWageCents: 1_292_300,
    rateWithoutPayrollCreditPpm: 357_500,
    standardRatePpm: 357_500,
    creditOffsetRatePpm: -310_100,
  },
  {
    fromAnnualWageCents: 2_393_100,
    rateWithoutPayrollCreditPpm: 357_500,
    standardRatePpm: 357_500,
    creditOffsetRatePpm: -19_500,
  },
  {
    fromAnnualWageCents: 2_973_700,
    rateWithoutPayrollCreditPpm: 357_500,
    standardRatePpm: 357_500,
    creditOffsetRatePpm: 44_500,
  },
  {
    fromAnnualWageCents: 3_471_900,
    rateWithoutPayrollCreditPpm: 357_500,
    standardRatePpm: 357_500,
    creditOffsetRatePpm: 44_500,
  },
  {
    fromAnnualWageCents: 3_740_900,
    rateWithoutPayrollCreditPpm: 357_500,
    standardRatePpm: 357_500,
    creditOffsetRatePpm: 44_500,
  },
  {
    fromAnnualWageCents: 3_888_400,
    rateWithoutPayrollCreditPpm: 375_600,
    standardRatePpm: 375_600,
    creditOffsetRatePpm: 44_500,
  },
  {
    fromAnnualWageCents: 4_112_400,
    rateWithoutPayrollCreditPpm: 375_600,
    standardRatePpm: 375_600,
    creditOffsetRatePpm: 44_500,
  },
  {
    fromAnnualWageCents: 4_559_300,
    rateWithoutPayrollCreditPpm: 375_600,
    standardRatePpm: 375_600,
    creditOffsetRatePpm: 129_100,
  },
  {
    fromAnnualWageCents: 4_600_300,
    rateWithoutPayrollCreditPpm: 375_600,
    standardRatePpm: 375_600,
    creditOffsetRatePpm: 129_100,
  },
  {
    fromAnnualWageCents: 5_978_300,
    rateWithoutPayrollCreditPpm: 375_600,
    standardRatePpm: 375_600,
    creditOffsetRatePpm: 129_100,
  },
  {
    fromAnnualWageCents: 7_842_700,
    rateWithoutPayrollCreditPpm: 495_000,
    standardRatePpm: 495_000,
    creditOffsetRatePpm: 65_100,
  },
  {
    fromAnnualWageCents: 14_355_500,
    rateWithoutPayrollCreditPpm: 495_000,
    standardRatePpm: 495_000,
    creditOffsetRatePpm: 0,
  },
];

const sharedPayrollParameters = {
  specialRemunerationUnderAowAge,
  maximumContributionWageAnnualCents: 7_940_900,
  employerHealthcareActRatePpm: 61_000,
  employeeHealthcareActWithholdingRatePpm: 48_500,
} as const;

export const PAYROLL_2026_RULE_ID = "nl-payroll-2026-r3";

/** Binding monthly and four-week white-table calculation parameters. */
export const PAYROLL_2026: RuleDefinition<PayrollRuleParameters> = defineRule(
  {
    id: PAYROLL_2026_RULE_ID,
    legalFrom: "2026-01-01",
    legalTo: "2026-12-31",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    publishedAt: "2026-01-08",
    verifiedAt: "2026-11-12",
    sources: [
      SOURCE_MONTHLY_WAGE_TABLE,
      SOURCE_FOUR_WEEK_WAGE_TABLE,
      SOURCE_PAYROLL_CALCULATION_RULES,
      SOURCE_SPECIAL_REMUNERATION_TABLE,
      SOURCE_LOONHEFFINGEN_ANNEX,
      SOURCE_PAYROLL_TABLE_INDEX,
    ],
  },
  {
    ...sharedPayrollParameters,
    periodTablesIncluded: true,
    regularPeriodTable: {
      annualWageStepCents: 5_400,
      maximumAnnualTableWageCents: 13_311_000,
      maximumMonthlyTableWageCents: 1_109_250,
      maximumFourWeekTableWageCents: 1_023_924,
      topRatePpm: 495_000,
    },
  } satisfies PayrollRuleParameters,
  parseParameters,
);
