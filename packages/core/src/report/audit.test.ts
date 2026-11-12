import { describe, expect, test } from "vite-plus/test";
import type { EmployerPackageInput } from "../model/compensation.js";
import { eur, rational } from "../model/scalars.js";
import { syntheticExplicitFact, syntheticMonthlyOffer } from "../test/fixtures.js";
import { normalizeEmployerPackage } from "./normalization.js";

const gacCents = (input: EmployerPackageInput): number => {
  const value = normalizeEmployerPackage(input).report.guaranteedAnnualCash;
  if (value.kind !== "exact") throw new Error(`expected an exact GAC, received ${value.kind}`);
  return value.value.amountCents;
};

describe("audit: Guaranteed Annual Cash stays guaranteed cash", () => {
  const baseline = syntheticMonthlyOffer();

  test("the documented golden case is unchanged", () => {
    // 12 x EUR 4.600 = EUR 55.200 base, plus the 8% holiday allowance.
    expect(gacCents(baseline)).toBe(5_961_600);
  });

  test("reimbursements, taxable benefits, equity, and pension never enter GAC", () => {
    const loaded: EmployerPackageInput = {
      ...baseline,
      pension: {
        employeeContribution: syntheticExplicitFact(eur(150_000)),
        employerContribution: syntheticExplicitFact(eur(900_000)),
        contributionPeriod: "annual",
      },
      reimbursements: [
        {
          id: "commute",
          label: "Commute",
          amount: { amount: syntheticExplicitFact(eur(20_000)), period: "monthly" },
          taxable: syntheticExplicitFact(false),
        },
      ],
      taxableBenefits: [
        {
          id: "lease-car",
          label: "Lease car",
          taxableValue: { amount: syntheticExplicitFact(eur(40_000)), period: "monthly" },
          cashPaidToEmployee: false,
        },
      ],
      nonCashBenefits: [
        {
          id: "options",
          label: "Share options",
          kind: "equity",
          employeeValue: syntheticExplicitFact(eur(2_500_000)),
        },
        {
          id: "laptop",
          label: "Laptop",
          kind: "equipment",
          employerCost: syntheticExplicitFact(eur(200_000)),
        },
      ],
    };
    expect(gacCents(loaded)).toBe(gacCents(baseline));
  });

  test("a variable bonus raises expected variable cash and never GAC", () => {
    const withBonus: EmployerPackageInput = {
      ...baseline,
      cashComponents: [
        {
          id: "target-bonus",
          label: "Target bonus",
          category: "variable",
          amount: { amount: syntheticExplicitFact(eur(1_000_000)), period: "annual" },
          probability: syntheticExplicitFact({ partsPerMillion: 500_000 }),
          includedInQuotedPay: syntheticExplicitFact(false),
        },
      ],
    };
    const outcome = normalizeEmployerPackage(withBonus);
    expect(gacCents(withBonus)).toBe(gacCents(baseline));
    expect(outcome.report.expectedVariableCash).toStrictEqual({
      kind: "exact",
      value: eur(500_000),
    });
    expect(
      outcome.report.guaranteedBreakdown.some((item) => item.componentId === "target-bonus"),
    ).toBe(false);
  });

  test("guaranteed cash added to the package raises GAC by exactly that amount", () => {
    const withThirteenth: EmployerPackageInput = {
      ...baseline,
      cashComponents: [
        {
          id: "thirteenth-month",
          label: "Guaranteed thirteenth month",
          category: "guaranteed",
          amount: { amount: syntheticExplicitFact(eur(460_000)), period: "annual" },
          includedInQuotedPay: syntheticExplicitFact(false),
        },
      ],
    };
    expect(gacCents(withThirteenth)).toBe(gacCents(baseline) + 460_000);
  });

  test("GAC is monotone in guaranteed cash for every added amount", () => {
    let previous = gacCents(baseline);
    for (const cents of [1, 100, 12_345, 460_000, 1_000_000]) {
      const value = gacCents({
        ...baseline,
        cashComponents: [
          {
            id: "extra",
            label: "Extra guaranteed cash",
            category: "guaranteed",
            amount: { amount: syntheticExplicitFact(eur(cents)), period: "annual" },
            includedInQuotedPay: syntheticExplicitFact(false),
          },
        ],
      });
      expect(value).toBeGreaterThan(previous - 1);
      previous = value;
    }
  });

  test("the same input always produces the same report", () => {
    const first = JSON.stringify(normalizeEmployerPackage(baseline).report);
    const second = JSON.stringify(normalizeEmployerPackage(baseline).report);
    expect(first).toBe(second);
  });

  test("an IKB holiday component cannot double count the statutory holiday allowance", () => {
    const withIkb: EmployerPackageInput = {
      ...baseline,
      ikbComponents: [
        {
          id: "ikb-holiday",
          kind: "holiday_allowance",
          rate: syntheticExplicitFact({ partsPerMillion: 80_000 }),
          includedInQuotedPay: syntheticExplicitFact(false),
          guaranteed: syntheticExplicitFact(true),
        },
      ],
    };
    // The IKB holiday component is the same money as `holidayPay`, so GAC must
    // not grow. A conflicting rate or inclusion is a diagnostic, not a silent sum.
    expect(gacCents(withIkb)).toBe(gacCents(baseline));
    const conflicting = normalizeEmployerPackage({
      ...withIkb,
      ikbComponents: [
        {
          id: "ikb-holiday",
          kind: "holiday_allowance",
          rate: syntheticExplicitFact({ partsPerMillion: 165_000 }),
          includedInQuotedPay: syntheticExplicitFact(false),
          guaranteed: syntheticExplicitFact(true),
        },
      ],
    });
    expect(conflicting.diagnostics.some((item) => item.code === "holiday_ikb_conflict")).toBe(true);
    expect(conflicting.report.precision).toBe("unavailable");
  });

  test("normalization derives hourly pay without reading a clock or the environment", () => {
    const source = normalizeEmployerPackage.toString();
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("process.env");
    const hourly: EmployerPackageInput = {
      ...baseline,
      salaryExpressions: [
        {
          amount: syntheticExplicitFact(eur(3_000)),
          period: "hourly",
          weeklyHours: syntheticExplicitFact({ kind: "custom", hours: rational(36, 1) }),
        },
      ],
      actualWeeklyHours: syntheticExplicitFact({ kind: "custom", hours: rational(36, 1) }),
    };
    expect(gacCents(hourly)).toBe(gacCents(hourly));
  });
});
