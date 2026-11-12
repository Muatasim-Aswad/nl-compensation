import { eur } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import type { AnnualIncomeContextInput } from "./income-context.js";
import { resolveAnnualIncomeContext } from "./income-context.js";

const euros = (amount: number) => eur(Math.round(amount * 100));

const base = (overrides: Partial<AnnualIncomeContextInput> = {}): AnnualIncomeContextInput => ({
  view: "steady_state",
  calendarYear: 2026,
  newJobCashInCalendarYear: euros(24_840),
  newJobCashFullYear: euros(59_616),
  ...overrides,
});

describe("steady state", () => {
  test("uses a complete calendar year and ignores pre-start income", () => {
    const result = resolveAnnualIncomeContext(base({ incomeBeforeStart: euros(18_000) }));

    expect(result.value?.taxableIncomeBox1).toEqual(euros(59_616));
    expect(result.value?.employmentIncome).toEqual(euros(59_616));
    expect(result.value?.withholdingAlreadyPaid).toEqual(eur(0));
    expect(result.value?.includesPartialYearEmployment).toBe(false);
  });

  test("subtracts pre-tax employee pension before tax", () => {
    const result = resolveAnnualIncomeContext(base({ preTaxEmployeePension: euros(3_600) }));
    expect(result.value?.taxableIncomeBox1).toEqual(euros(56_016));
  });

  test("adds other annual income and taxable benefits", () => {
    const result = resolveAnnualIncomeContext(
      base({ otherAnnualIncome: euros(1_200), taxableBenefits: euros(800) }),
    );
    expect(result.value?.taxableIncomeBox1).toEqual(euros(61_616));
    // Only employment income drives the labour tax credit.
    expect(result.value?.employmentIncome).toEqual(euros(59_616));
  });
});

describe("first calendar year", () => {
  test("combines pre-start income with the cash actually paid in that year", () => {
    const result = resolveAnnualIncomeContext(
      base({
        view: "first_calendar_year",
        incomeBeforeStart: euros(18_000),
        withholdingBeforeStart: euros(4_100),
      }),
    );

    expect(result.value?.taxableIncomeBox1).toEqual(euros(42_840));
    expect(result.value?.withholdingAlreadyPaid).toEqual(euros(4_100));
    expect(result.value?.includesPartialYearEmployment).toBe(true);
  });

  test("without pre-start income no first-year estimate is invented", () => {
    const result = resolveAnnualIncomeContext(base({ view: "first_calendar_year" }));

    expect(result.precision).toBe("unsupported");
    expect(result.value).toBeUndefined();
    expect(result.missingInputs).toContain("firstYear.incomeBeforeStart");
  });

  test("withholding already paid is a settlement input, not compensation", () => {
    const result = resolveAnnualIncomeContext(
      base({
        view: "first_calendar_year",
        incomeBeforeStart: euros(18_000),
        withholdingBeforeStart: euros(4_100),
      }),
    );

    expect(result.value!.taxableIncomeBox1.amountCents).toBe(
      euros(18_000).amountCents + euros(24_840).amountCents,
    );
    expect(result.assumptions.map((item) => item.code)).toContain("nl_refund_is_not_compensation");
  });
});
