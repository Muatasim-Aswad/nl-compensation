import type { Money } from "@nl-compensation/core";
import { eur } from "@nl-compensation/core";
import { selectRow } from "../rules/define.js";
import { INCOME_TAX_2026, INCOME_TAX_2026_RULE_ID } from "../rules/income-tax-2026.js";
import type { SpecialRemunerationRow } from "../rules/payroll-2026.js";
import { PAYROLL_2026, PAYROLL_2026_RULE_ID } from "../rules/payroll-2026.js";
import type { Fraction } from "../support/rational.js";
import {
  CENTS_PER_EURO,
  add,
  clampAtZero,
  div,
  floorToInteger,
  fromInt,
  min,
  percentageOf,
  roundHalfAwayFromZero,
} from "../support/rational.js";
import type { RuleOutcome } from "../support/result.js";
import { centsToMoney, supported, unsupported } from "../support/result.js";

export interface SpecialRemunerationInput {
  /** The employee's jaarloon, which selects the table row. */
  readonly annualWage: Money;
  /** The separately paid holiday allowance, year-end payment, or bonus. */
  readonly payment: Money;
  readonly payrollTaxCreditApplied: boolean;
  readonly underAowAge: boolean;
  readonly residentOfNetherlands: boolean;
}

export interface SpecialRemunerationResult {
  readonly payment: Money;
  readonly appliedRatePpm: number;
  readonly withholding: Money;
  readonly netPayment: Money;
}

/**
 * Withholding on a separately paid special remuneration, from the witte tabel
 * bijzondere beloningen.
 *
 * With the payroll tax credit applied the rate is the standaardtarief plus the
 * verrekeningspercentage loonheffingskorting, which is negative while a credit
 * is still building up. The leaflet instructs rounding the result to cents in
 * the employee's favour, so the withholding is rounded down.
 */
export function calculateSpecialRemunerationWithholding(
  input: SpecialRemunerationInput,
  rule = PAYROLL_2026,
): RuleOutcome<SpecialRemunerationResult> {
  const parts = { ruleIds: [PAYROLL_2026_RULE_ID] };

  if (!input.underAowAge || !input.residentOfNetherlands) {
    return unsupported(
      {
        code: "nl_payroll_special_remuneration_category_not_supported",
        layer: "fiscal_payroll",
        message:
          "Only employees below the AOW age who live in the Netherlands are supported for special-remuneration withholding.",
        affectedOutputs: ["fiscalPayroll.specialPaymentWithholding"],
      },
      parts,
    );
  }

  const row: SpecialRemunerationRow = selectRow(
    rule.parameters.specialRemunerationUnderAowAge,
    (candidate) => candidate.fromAnnualWageCents,
    input.annualWage.amountCents,
  );
  const appliedRatePpm = input.payrollTaxCreditApplied
    ? row.standardRatePpm + row.creditOffsetRatePpm
    : row.rateWithoutPayrollCreditPpm;

  const withholdingCents = floorToInteger(
    percentageOf(fromInt(input.payment.amountCents), appliedRatePpm),
  );
  const bounded = withholdingCents > 0n ? withholdingCents : 0n;

  return supported(
    "exact",
    {
      payment: input.payment,
      appliedRatePpm,
      withholding: centsToMoney(bounded),
      netPayment: centsToMoney(BigInt(input.payment.amountCents) - bounded),
    },
    {
      ...parts,
      trace: [
        {
          id: "special-remuneration-withholding",
          operation: "special_remuneration_table_lookup",
          inputPaths: ["fiscal.annualWage", "employerPackage.specialPayment"],
          outputPath: "fiscalPayroll.specialPaymentWithholding",
          ruleId: PAYROLL_2026_RULE_ID,
          rounding: "withholding rounded down to cents, in the employee's favour",
        },
      ],
    },
  );
}

export interface RegularPeriodInput {
  /** Fiscal wage paid in this regular pay period, after pre-tax deductions. */
  readonly periodWage: Money;
  /** 12 for monthly pay, 13 for four-weekly pay. */
  readonly periodsPerYear: number;
  readonly payrollTaxCreditApplied: boolean;
  readonly underAowAge: boolean;
  readonly residentOfNetherlands: boolean;
}

export interface RegularPeriodResult {
  readonly annualWithholding: Money;
  readonly periodWithholding: Money;
  readonly periodsPerYear: number;
}

const ceilToInteger = (value: Fraction): bigint => -floorToInteger({ n: -value.n, d: value.d });

function grossPayrollTaxWholeEuros(annualWageCents: number): bigint {
  const annualWageEuros = fromInt(BigInt(annualWageCents) / CENTS_PER_EURO);
  let cumulativeWholeEuros = 0n;

  for (const band of INCOME_TAX_2026.parameters.box1BandsUnderAowAge) {
    const fromEuros = fromInt(BigInt(band.fromCents) / CENTS_PER_EURO);
    const upperEuros =
      band.toCents === null ? annualWageEuros : fromInt(BigInt(band.toCents) / CENTS_PER_EURO);
    const wageInBand = min(annualWageEuros, upperEuros);
    const taxAtWage = add(
      fromInt(cumulativeWholeEuros),
      percentageOf({ n: wageInBand.n - fromEuros.n, d: 1n }, band.ratePpm),
    );
    if (band.toCents === null || annualWageCents <= band.toCents) {
      return floorToInteger(taxAtWage);
    }
    cumulativeWholeEuros = floorToInteger(taxAtWage);
  }

  return cumulativeWholeEuros;
}

function generalPayrollCreditWholeEuros(annualWageCents: number): bigint {
  const wageEuros = fromInt(BigInt(annualWageCents) / CENTS_PER_EURO);
  const segment = INCOME_TAX_2026.parameters.generalTaxCreditSegments.find(
    (candidate) => candidate.toCents === null || annualWageCents <= candidate.toCents,
  );
  if (segment === undefined) return 0n;
  const fromEuros = fromInt(BigInt(segment.fromCents) / CENTS_PER_EURO);
  const baseEuros = fromInt(BigInt(segment.baseAmountCents) / CENTS_PER_EURO);
  const credit = clampAtZero(
    add(baseEuros, percentageOf({ n: wageEuros.n - fromEuros.n, d: 1n }, segment.ratePpm)),
  );
  return ceilToInteger(credit);
}

function labourPayrollCreditWholeEuros(annualWageCents: number): bigint {
  const segments = INCOME_TAX_2026.parameters.labourTaxCreditSegments;
  const phaseOne = segments[0];
  const phaseTwo = segments[1];
  const phaseThree = segments[2];
  const decline = segments[3];
  if (
    phaseOne === undefined ||
    phaseTwo === undefined ||
    phaseThree === undefined ||
    decline === undefined ||
    (decline.toCents !== null && annualWageCents > decline.toCents)
  ) {
    return 0n;
  }

  const wageEuros = fromInt(BigInt(annualWageCents) / CENTS_PER_EURO);
  let credit = min(
    percentageOf(wageEuros, phaseOne.ratePpm),
    fromInt(BigInt(phaseTwo.baseAmountCents) / CENTS_PER_EURO),
  );
  credit = min(
    add(
      credit,
      percentageOf(
        clampAtZero({
          n: wageEuros.n - BigInt(phaseTwo.fromCents) / CENTS_PER_EURO,
          d: 1n,
        }),
        phaseTwo.ratePpm,
      ),
    ),
    fromInt(BigInt(phaseThree.baseAmountCents) / CENTS_PER_EURO),
  );
  credit = min(
    add(
      credit,
      percentageOf(
        clampAtZero({
          n: wageEuros.n - BigInt(phaseThree.fromCents) / CENTS_PER_EURO,
          d: 1n,
        }),
        phaseThree.ratePpm,
      ),
    ),
    fromInt(BigInt(decline.baseAmountCents) / CENTS_PER_EURO),
  );
  credit = clampAtZero(
    add(
      credit,
      percentageOf(
        clampAtZero({
          n: wageEuros.n - BigInt(decline.fromCents) / CENTS_PER_EURO,
          d: 1n,
        }),
        decline.ratePpm,
      ),
    ),
  );
  return ceilToInteger(credit);
}

function tablePeriodWithholdingCents(
  annualTableWageCents: number,
  periodsPerYear: number,
  payrollTaxCreditApplied: boolean,
): bigint {
  const grossTax = grossPayrollTaxWholeEuros(annualTableWageCents);
  const credits = payrollTaxCreditApplied
    ? generalPayrollCreditWholeEuros(annualTableWageCents) +
      labourPayrollCreditWholeEuros(annualTableWageCents)
    : 0n;
  const annualWithholdingEuros = grossTax > credits ? grossTax - credits : 0n;
  return roundHalfAwayFromZero(
    div(fromInt(annualWithholdingEuros * CENTS_PER_EURO), fromInt(periodsPerYear)),
  );
}

/** Binding 2026 white-table withholding for a monthly or four-week pay period. */
export function estimateRegularPeriodWithholding(
  input: RegularPeriodInput,
): RuleOutcome<RegularPeriodResult> {
  if (input.periodsPerYear !== 12 && input.periodsPerYear !== 13) {
    return unsupported(
      {
        code: "nl_payroll_invalid_period_count",
        layer: "fiscal_payroll",
        message: "Only the published monthly (12) and four-week (13) wage tables are supported.",
        affectedOutputs: ["fiscalPayroll.payrollWithholdingRegular"],
      },
      { ruleIds: [PAYROLL_2026_RULE_ID] },
    );
  }

  if (!input.underAowAge || !input.residentOfNetherlands) {
    return unsupported(
      {
        code: "nl_payroll_regular_category_not_supported",
        layer: "fiscal_payroll",
        message:
          "Regular withholding supports the standard white table for employees below AOW age who live in the Netherlands.",
        affectedOutputs: ["fiscalPayroll.payrollWithholdingRegular"],
      },
      { ruleIds: [PAYROLL_2026_RULE_ID] },
    );
  }

  const table = PAYROLL_2026.parameters.regularPeriodTable;

  const maximumPeriodWageCents =
    input.periodsPerYear === 12
      ? table.maximumMonthlyTableWageCents
      : table.maximumFourWeekTableWageCents;
  const boundedPeriodWageCents = Math.max(0, input.periodWage.amountCents);
  let periodCents: bigint;
  if (boundedPeriodWageCents <= maximumPeriodWageCents) {
    const annualizedCents = boundedPeriodWageCents * input.periodsPerYear;
    const steppedAnnualCents = Math.min(
      table.maximumAnnualTableWageCents,
      Math.floor(annualizedCents / table.annualWageStepCents) * table.annualWageStepCents,
    );
    periodCents = tablePeriodWithholdingCents(
      steppedAnnualCents,
      input.periodsPerYear,
      input.payrollTaxCreditApplied,
    );
  } else {
    const maximumTableCents = tablePeriodWithholdingCents(
      table.maximumAnnualTableWageCents,
      input.periodsPerYear,
      input.payrollTaxCreditApplied,
    );
    const excessCents = boundedPeriodWageCents - maximumPeriodWageCents;
    periodCents =
      maximumTableCents + floorToInteger(percentageOf(fromInt(excessCents), table.topRatePpm));
  }
  const annualWithholdingCents = periodCents * BigInt(input.periodsPerYear);

  return supported(
    "exact",
    {
      annualWithholding: centsToMoney(annualWithholdingCents),
      periodWithholding: centsToMoney(periodCents),
      periodsPerYear: input.periodsPerYear,
    },
    {
      ruleIds: [INCOME_TAX_2026_RULE_ID, PAYROLL_2026_RULE_ID],
      trace: [
        {
          id: "regular-period-withholding",
          operation: "white_period_wage_table",
          inputPaths: ["fiscal.periodWage", "fiscal.payrollTaxCreditApplied"],
          outputPath: "fiscalPayroll.payrollWithholdingRegular",
          ruleId: PAYROLL_2026_RULE_ID,
          rounding:
            "select the nearest lower published tabelloon; above the maximum, round 49.50% of the excess down to cents",
        },
      ],
    },
  );
}

/** Positive when the employee can expect a refund, negative when tax is still due. */
export function settlementEstimate(totalWithheld: Money, finalAnnualTax: Money): Money {
  return eur(totalWithheld.amountCents - finalAnnualTax.amountCents);
}

/** Annual net divided by twelve, rounded down to cents. */
export function averageMonthlyNet(annualNet: Money): Money {
  return centsToMoney(floorToInteger(div(fromInt(annualNet.amountCents), fromInt(12))));
}

/** Whole euros expressed in cents, used where a figure is presented per year. */
export const wholeEuros = (euros: number): Money => eur(Number(BigInt(euros) * CENTS_PER_EURO));
