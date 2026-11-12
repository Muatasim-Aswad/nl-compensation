import type { Money } from "@nl-compensation/core";
import { eur } from "@nl-compensation/core";
import { INCOME_TAX_2026_RULE_ID } from "../rules/income-tax-2026.js";
import type { RuleOutcome } from "../support/result.js";
import { supported, unsupported } from "../support/result.js";

export type AnnualView = "first_calendar_year" | "steady_state";

export interface AnnualIncomeContextInput {
  readonly view: AnnualView;
  readonly calendarYear: number;
  /**
   * Gross employment income already earned in the calendar year before the new
   * job started, from a previous employer or benefit.
   */
  readonly incomeBeforeStart?: Money;
  /** Tax already withheld on `incomeBeforeStart`. */
  readonly withholdingBeforeStart?: Money;
  /**
   * Guaranteed cash from the new job that is actually paid inside this calendar
   * year, which is less than a full year when the job starts mid-year.
   */
  readonly newJobCashInCalendarYear: Money;
  /** Guaranteed cash from the new job over a complete calendar year. */
  readonly newJobCashFullYear: Money;
  /** Pre-tax employee pension deductions for the same period as the cash figure. */
  readonly preTaxEmployeePension?: Money;
  readonly otherAnnualIncome?: Money;
  readonly taxableBenefits?: Money;
}

export interface AnnualIncomeContext {
  readonly view: AnnualView;
  readonly calendarYear: number;
  /** Box 1 taxable income for the view, after pre-tax pension deductions. */
  readonly taxableIncomeBox1: Money;
  /** Arbeidsinkomen for the labour tax credit. */
  readonly employmentIncome: Money;
  readonly withholdingAlreadyPaid: Money;
  readonly includesPartialYearEmployment: boolean;
}

const amount = (value: Money | undefined): number => value?.amountCents ?? 0;

/**
 * Resolves the annual income picture for one view.
 *
 * The first-calendar-year view adds income earned before the job started to the
 * new job's cash that is actually paid inside the year. The steady-state view
 * assumes a complete calendar year in the new job and ignores pre-start income.
 *
 * Neither view treats a tax refund or a government allowance as compensation:
 * withholding already paid is carried separately so a settlement can be
 * reported as a settlement.
 */
export function resolveAnnualIncomeContext(
  input: AnnualIncomeContextInput,
): RuleOutcome<AnnualIncomeContext> {
  const parts = { ruleIds: [INCOME_TAX_2026_RULE_ID] };

  if (input.view === "first_calendar_year" && input.incomeBeforeStart === undefined) {
    return unsupported(
      {
        code: "nl_first_year_prior_income_required",
        layer: "fiscal_payroll",
        message:
          "The first-calendar-year view needs the income already earned in that year before the job started; without it no first-year estimate is produced.",
        affectedOutputs: ["household.firstCalendarYear", "fiscalPayroll.possibleSettlement"],
      },
      { ...parts, missingInputs: ["firstYear.incomeBeforeStart"] },
    );
  }

  const firstYear = input.view === "first_calendar_year";
  const jobCash = firstYear ? input.newJobCashInCalendarYear : input.newJobCashFullYear;
  const priorIncome = firstYear ? amount(input.incomeBeforeStart) : 0;
  const employmentIncome = jobCash.amountCents + priorIncome - amount(input.preTaxEmployeePension);
  const taxable =
    employmentIncome + amount(input.otherAnnualIncome) + amount(input.taxableBenefits);

  return supported(
    "estimated",
    {
      view: input.view,
      calendarYear: input.calendarYear,
      taxableIncomeBox1: eur(Math.max(0, taxable)),
      employmentIncome: eur(Math.max(0, employmentIncome)),
      withholdingAlreadyPaid: eur(firstYear ? amount(input.withholdingBeforeStart) : 0),
      includesPartialYearEmployment:
        firstYear &&
        input.newJobCashInCalendarYear.amountCents < input.newJobCashFullYear.amountCents,
    },
    {
      ...parts,
      assumptions: [
        {
          code: firstYear ? "nl_first_year_view" : "nl_steady_state_view",
          message: firstYear
            ? "The first calendar year combines pre-start income with the new job's cash actually paid inside that year."
            : "The steady-state view assumes a complete calendar year in the new job.",
          affectedPaths: ["fiscalPayroll.fiscalWageAnnual"],
        },
        {
          code: "nl_refund_is_not_compensation",
          message:
            "Tax already withheld is carried as a settlement input; a refund is never counted as employer compensation.",
          affectedPaths: ["fiscalPayroll.possibleSettlement"],
        },
      ],
    },
  );
}
