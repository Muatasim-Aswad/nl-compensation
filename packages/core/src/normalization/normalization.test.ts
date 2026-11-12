import { describe, expect, test } from "vite-plus/test";
import type { PayExpression } from "../model/compensation.js";
import type { Fact } from "../model/provenance.js";
import type { Money } from "../model/scalars.js";
import { eur } from "../model/scalars.js";
import { exact, range, unknown } from "../model/value.js";
import { normalizeEmployerPackage } from "../report/normalization.js";
import { solveSalaryExpressions } from "../solver/salary-solver.js";
import { syntheticExplicitFact, syntheticMonthlyOffer } from "../test/fixtures.js";
import { annualizePayExpression } from "./pay.js";

const money = (
  value: import("../model/value.js").Value<Money>,
): number | readonly [number, number] => {
  if (value.kind === "unknown") throw new Error(`unexpected unknown: ${value.reason}`);
  return value.kind === "exact"
    ? value.value.amountCents
    : [value.min.amountCents, value.max.amountCents];
};

const fact = <T>(value: T, options: Partial<Fact<T>> = {}): Fact<T> => ({
  value: exact(value),
  origin: "offer",
  evidenceStatus: "explicit",
  validationState: "valid",
  locked: true,
  ...options,
});

const hours40 = fact({ kind: "standard", hours: 40 } as const);

describe("pay normalization properties", () => {
  test("annualizes all supported pay periods", () => {
    const expressions: readonly PayExpression[] = [
      { amount: fact(eur(460_000)), period: "monthly" },
      { amount: fact(eur(424_615)), period: "four_weekly" },
      { amount: fact(eur(2_500)), period: "hourly", weeklyHours: hours40 },
      { amount: fact(eur(5_520_000)), period: "annual" },
    ];
    expect(expressions.map((expression) => money(annualizePayExpression(expression)))).toEqual([
      5_520_000, 5_519_995, 5_200_000, 5_520_000,
    ]);
  });

  test("preserves exact monthly annualization for cents around rounding boundaries", () => {
    for (let monthlyCents = 1; monthlyCents <= 100_001; monthlyCents += 997) {
      const annualized = annualizePayExpression({
        amount: fact(eur(monthlyCents)),
        period: "monthly",
      });
      expect(money(annualized)).toBe(monthlyCents * 12);
    }
  });

  test("propagates correlated ranges without collapsing their identity", () => {
    const annualized = annualizePayExpression({
      amount: {
        ...fact(eur(0)),
        value: range(eur(400_000), eur(500_000), "listed-band"),
      },
      period: "monthly",
    });
    expect(annualized).toEqual(range(eur(4_800_000), eur(6_000_000), "listed-band"));
  });
});

describe("interactive salary constraints", () => {
  test("accepts independently rounded monthly and hourly locked expressions", () => {
    const solution = solveSalaryExpressions(
      [
        { amount: fact(eur(460_000), { origin: "contract" }), period: "monthly" },
        {
          amount: fact(eur(2_654), { origin: "offer" }),
          period: "hourly",
          weeklyHours: hours40,
        },
      ],
      hours40,
    );
    expect(solution.diagnostics).toEqual([]);
    expect(money(solution.annualBase)).toBe(5_520_000);
    expect(solution.representations.map((item) => item.period)).toEqual([
      "annual",
      "monthly",
      "four_weekly",
      "hourly",
    ]);
  });

  test("rejects locked conflicts rather than silently choosing one", () => {
    const solution = solveSalaryExpressions(
      [
        { amount: fact(eur(4_000_000), { origin: "contract" }), period: "annual" },
        { amount: fact(eur(5_000_000), { origin: "offer" }), period: "annual" },
      ],
      hours40,
    );
    expect(solution.annualBase).toEqual(unknown("not_known"));
    expect(solution.diagnostics[0]).toMatchObject({
      code: "locked_salary_conflict",
      severity: "error",
    });
  });

  test("uses source precedence for unlocked conflicts and keeps a diagnostic", () => {
    const solution = solveSalaryExpressions(
      [
        { amount: fact(eur(4_000_000), { origin: "listing", locked: false }), period: "annual" },
        { amount: fact(eur(5_000_000), { origin: "contract", locked: false }), period: "annual" },
      ],
      hours40,
    );
    expect(money(solution.annualBase)).toBe(5_000_000);
    expect(solution.selectedExpressionIndex).toBe(1);
    expect(solution.diagnostics[0]).toMatchObject({ code: "salary_source_disagreement" });
  });

  test("normalizes an explicitly full-time quote to actual hours and derives employer FTE", () => {
    const hours36 = fact({ kind: "standard", hours: 36 } as const);
    const solution = solveSalaryExpressions(
      [
        {
          amount: fact(eur(400_000)),
          period: "monthly",
          weeklyHours: hours40,
        },
      ],
      hours36,
      hours40,
    );
    expect(money(solution.annualBase)).toBe(4_320_000);
    expect(money(solution.employerFullTimeAnnualBase)).toBe(4_800_000);
    expect(
      money(
        solution.employerFullTimeRepresentations.find((item) => item.period === "monthly")!.amount,
      ),
    ).toBe(400_000);
  });
});

describe("Guaranteed Annual Cash", () => {
  test("matches the synthetic €4,600 monthly golden amounts", () => {
    const employerPackage = syntheticMonthlyOffer();
    const withoutYearEnd = normalizeEmployerPackage(employerPackage);
    expect(money(withoutYearEnd.report.guaranteedBreakdown[0]!.annualAmount)).toBe(5_520_000);
    expect(money(withoutYearEnd.report.guaranteedAnnualCash)).toBe(5_961_600);

    const withYearEnd = normalizeEmployerPackage({
      ...employerPackage,
      cashComponents: [
        {
          id: "guaranteed-month",
          label: "Guaranteed extra month",
          category: "guaranteed",
          amount: { amount: syntheticExplicitFact(eur(460_000)), period: "annual" },
          includedInQuotedPay: syntheticExplicitFact(false),
        },
      ],
    });
    expect(money(withYearEnd.report.guaranteedAnnualCash)).toBe(6_421_600);
    expect(withYearEnd.report.precision).toBe("exact");
  });

  test("extracts included holiday pay and does not add it twice", () => {
    const employerPackage = syntheticMonthlyOffer();
    const outcome = normalizeEmployerPackage({
      ...employerPackage,
      salaryExpressions: [{ amount: syntheticExplicitFact(eur(5_961_600)), period: "annual" }],
      holidayPay: {
        ...employerPackage.holidayPay,
        inclusion: syntheticExplicitFact("included"),
      },
      ikbComponents: [
        {
          id: "ikb-holiday",
          kind: "holiday_allowance",
          rate: syntheticExplicitFact({ partsPerMillion: 80_000 }),
          includedInQuotedPay: syntheticExplicitFact(true),
          guaranteed: syntheticExplicitFact(true),
        },
      ],
    });
    expect(money(outcome.report.guaranteedBreakdown[0]!.annualAmount)).toBe(5_520_000);
    expect(money(outcome.report.guaranteedAnnualCash)).toBe(5_961_600);
    expect(outcome.report.guaranteedBreakdown).toHaveLength(2);
  });

  test("extracts an included guaranteed month instead of double counting it", () => {
    const employerPackage = syntheticMonthlyOffer();
    const outcome = normalizeEmployerPackage({
      ...employerPackage,
      salaryExpressions: [{ amount: syntheticExplicitFact(eur(5_980_000)), period: "annual" }],
      cashComponents: [
        {
          id: "guaranteed-month",
          label: "Guaranteed extra month",
          category: "guaranteed",
          amount: { amount: syntheticExplicitFact(eur(460_000)), period: "annual" },
          includedInQuotedPay: syntheticExplicitFact(true),
        },
      ],
    });
    expect(money(outcome.report.guaranteedBreakdown[0]!.annualAmount)).toBe(5_520_000);
    expect(money(outcome.report.guaranteedAnnualCash)).toBe(6_421_600);
  });

  test("propagates salary ranges through holiday allowance and GAC", () => {
    const employerPackage = syntheticMonthlyOffer();
    const outcome = normalizeEmployerPackage({
      ...employerPackage,
      salaryExpressions: [
        {
          amount: {
            ...syntheticExplicitFact(eur(0)),
            value: range(eur(400_000), eur(500_000), "offer-band"),
          },
          period: "monthly",
        },
      ],
    });
    expect(money(outcome.report.guaranteedAnnualCash)).toEqual([5_184_000, 6_480_000]);
    expect(outcome.report.guaranteedAnnualCash).toMatchObject({
      kind: "range",
      correlationId: "offer-band",
    });
    expect(outcome.report.precision).toBe("estimated");
  });

  test("uses an explicit component subset as the holiday-pay basis", () => {
    const employerPackage = syntheticMonthlyOffer();
    const outcome = normalizeEmployerPackage({
      ...employerPackage,
      holidayPay: {
        ...employerPackage.holidayPay,
        basis: syntheticExplicitFact({
          kind: "component_ids",
          componentIds: ["base_salary", "guaranteed-month"],
        }),
      },
      cashComponents: [
        {
          id: "guaranteed-month",
          label: "Guaranteed extra month",
          category: "guaranteed",
          amount: { amount: syntheticExplicitFact(eur(460_000)), period: "annual" },
          includedInQuotedPay: syntheticExplicitFact(false),
        },
      ],
    });
    expect(money(outcome.report.guaranteedAnnualCash)).toBe(6_458_400);
  });

  test("keeps variable cash, reimbursements, and equity out of GAC", () => {
    const employerPackage = syntheticMonthlyOffer();
    const outcome = normalizeEmployerPackage({
      ...employerPackage,
      cashComponents: [
        {
          id: "bonus",
          label: "Target bonus",
          category: "variable",
          amount: { amount: syntheticExplicitFact(eur(1_000_000)), period: "annual" },
          probability: syntheticExplicitFact({ partsPerMillion: 500_000 }),
          includedInQuotedPay: syntheticExplicitFact(false),
        },
      ],
      reimbursements: [
        {
          id: "travel",
          label: "Travel reimbursement",
          amount: { amount: syntheticExplicitFact(eur(20_000)), period: "monthly" },
          taxable: syntheticExplicitFact(false),
        },
      ],
      nonCashBenefits: [
        {
          id: "equity",
          label: "Private equity",
          kind: "equity",
          employeeValue: syntheticExplicitFact(eur(9_999_999)),
        },
      ],
    });
    expect(money(outcome.report.guaranteedAnnualCash)).toBe(5_961_600);
    expect(money(outcome.report.expectedVariableCash)).toBe(500_000);
  });

  test("scales actual-hours GAC independently to a 40-hour and hourly equivalent", () => {
    const employerPackage = syntheticMonthlyOffer();
    const outcome = normalizeEmployerPackage({
      ...employerPackage,
      actualWeeklyHours: syntheticExplicitFact({ kind: "standard", hours: 36 }),
      employerFullTimeWeeklyHours: syntheticExplicitFact({ kind: "standard", hours: 40 }),
    });
    expect(money(outcome.report.guaranteedAnnualCashAtActualHours)).toBe(5_961_600);
    expect(money(outcome.report.guaranteedAnnualCashAt40Hours)).toBe(6_624_000);
    expect(money(outcome.report.nominalHourlyEquivalent)).toBe(3_185);
  });

  test("turns unknown holiday inclusion into an explicit completeness gap", () => {
    const employerPackage = syntheticMonthlyOffer();
    const outcome = normalizeEmployerPackage({
      ...employerPackage,
      holidayPay: {
        ...employerPackage.holidayPay,
        inclusion: {
          ...employerPackage.holidayPay.inclusion,
          value: unknown("not_known"),
        },
      },
    });
    expect(outcome.report.guaranteedAnnualCash.kind).toBe("unknown");
    expect(outcome.completeness).toMatchObject({
      precision: "unavailable",
      missingInputs: ["employerPackage.holidayPay.inclusion"],
    });
  });

  test("is referentially transparent across repeated boundary cases", () => {
    for (const monthlyCents of [1, 99, 100, 333_333, 999_999]) {
      const employerPackage = syntheticMonthlyOffer();
      const input = {
        ...employerPackage,
        salaryExpressions: [
          { amount: syntheticExplicitFact(eur(monthlyCents)), period: "monthly" as const },
        ],
      };
      const before = JSON.stringify(input);
      expect(normalizeEmployerPackage(input)).toEqual(normalizeEmployerPackage(input));
      expect(JSON.stringify(input)).toBe(before);
    }
  });
});
