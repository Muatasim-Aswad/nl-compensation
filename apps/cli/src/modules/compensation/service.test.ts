import {
  eur,
  parseCalculationResponse,
  range,
  type CompensationCaseInput,
  type Money,
  type Value,
} from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { syntheticCase } from "../../test/fixtures.js";
import {
  calculateCompensation,
  calculateRequest,
  createCalculationRequest,
  requestFromUnknown,
  selectedRules,
} from "./service.js";

const calculatedAt = "2026-08-16T12:00:00.000Z";

function exactCents(value: Value<Money>): number {
  if (value.kind !== "exact") throw new Error(`expected exact money, received ${value.kind}`);
  return value.value.amountCents;
}

function expectEndpoints(
  actual: Value<Money>,
  minimum: Value<Money>,
  maximum: Value<Money>,
  label: string,
): void {
  const minimumCents = exactCents(minimum);
  const maximumCents = exactCents(maximum);
  if (minimumCents === maximumCents) {
    expect(actual, label).toEqual(minimum);
    return;
  }
  expect(actual, label).toMatchObject({
    kind: "range",
    min: eur(Math.min(minimumCents, maximumCents)),
    max: eur(Math.max(minimumCents, maximumCents)),
  });
}

function withMonthlySalary(value: Value<Money>): CompensationCaseInput {
  const base = syntheticCase();
  return {
    ...base,
    employerPackage: {
      ...base.employerPackage,
      salaryExpressions: [
        {
          ...base.employerPackage.salaryExpressions[0]!,
          amount: { ...base.employerPackage.salaryExpressions[0]!.amount, value },
        },
      ],
    },
    firstYear: undefined,
  };
}

describe("calculation adapter", () => {
  test("selects explicit immutable rules and emits a complete validated report", () => {
    const request = createCalculationRequest(syntheticCase(), { requestId: "test", calculatedAt });
    const result = parseCalculationResponse(calculateRequest(request));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.selectedRules).toEqual(selectedRules());
    expect(result.report.normalization.guaranteedAnnualCash).toEqual({
      kind: "exact",
      value: { amountCents: 5_961_600, currency: "EUR" },
    });
    expect(result.report.completeness.map((item) => item.layer)).toEqual([
      "normalization",
      "fiscal_payroll",
      "household",
      "non_cash",
    ]);
    expect(result.report.limitations).not.toContainEqual(
      expect.objectContaining({ code: "nl_payroll_period_table_not_bundled" }),
    );
    expect(result.report.assumptions).toContainEqual(
      expect.objectContaining({ code: "nl_payroll_even_period_wage" }),
    );
  });

  test("rejects a changed rule hash instead of silently calculating", () => {
    const request = createCalculationRequest(syntheticCase(), { requestId: "bad", calculatedAt });
    const result = calculateRequest({
      ...request,
      context: {
        ...request.context,
        rules: { ...request.context.rules, bundleContentHash: "changed" },
      },
    });
    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "unsupported_rules", path: "request.context.rules" }],
    });
  });

  test("bare cases and explicit envelopes converge on the same request", () => {
    const fromCase = requestFromUnknown(syntheticCase(), { requestId: "same", calculatedAt });
    const fromEnvelope = requestFromUnknown(fromCase, {
      requestId: "ignored",
      calculatedAt: "ignored",
    });
    expect(fromEnvelope).toEqual(fromCase);
    expect(calculateRequest(fromEnvelope)).toEqual(calculateRequest(fromCase));
  });

  test("Both is exactly the independently calculated minimum and maximum reports", () => {
    const lower = calculateCompensation(withMonthlySalary({ kind: "exact", value: eur(400_000) }), {
      engineVersion: "0.1.0",
      calculatedAt,
      rules: selectedRules(),
    });
    const upper = calculateCompensation(withMonthlySalary({ kind: "exact", value: eur(500_000) }), {
      engineVersion: "0.1.0",
      calculatedAt,
      rules: selectedRules(),
    });
    const ranged = calculateCompensation(
      withMonthlySalary(range(eur(400_000), eur(500_000), "salary-band")),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );

    const fields = [
      "fiscalWageAnnual",
      "finalIncomeTaxAnnual",
      "payrollWithholdingRegular",
      "specialPaymentWithholding",
      "normalPeriodGross",
      "normalPeriodNetSalary",
      "normalPeriodNetToBank",
      "annualNetThroughPayroll",
      "annualNetAfterSettlement",
      "averageMonthlyNet",
      "possibleSettlement",
    ] as const;
    for (const field of fields) {
      expectEndpoints(
        ranged.fiscalPayroll[field],
        lower.fiscalPayroll[field],
        upper.fiscalPayroll[field],
        field,
      );
    }
    expect(ranged.fiscalPayroll.specialPayments).toHaveLength(
      lower.fiscalPayroll.specialPayments.length,
    );
    for (const [index, payment] of ranged.fiscalPayroll.specialPayments.entries()) {
      const lowerPayment = lower.fiscalPayroll.specialPayments[index]!;
      const upperPayment = upper.fiscalPayroll.specialPayments[index]!;
      for (const field of [
        "gross",
        "withholding",
        "netPayment",
        "estimatedPeriodNetToBank",
      ] as const) {
        expectEndpoints(
          payment[field],
          lowerPayment[field],
          upperPayment[field],
          `${index}.${field}`,
        );
      }
    }
    expect(ranged.fiscalPayroll.precision).toBe("estimated");
    expect(ranged.assumptions).toContainEqual(
      expect.objectContaining({ code: "nl_range_scenario_endpoints" }),
    );
    expect(ranged.limitations).not.toContainEqual(
      expect.objectContaining({ code: "nl_payroll_range_interior_extrema_not_supported" }),
    );
    expect(
      ranged.completeness.find((item) => item.layer === "fiscal_payroll")?.missingInputs,
    ).not.toContain("normalization.guaranteedAnnualCash");
  });

  test("keeps annual net ranged when the optional pension deduction is omitted", () => {
    const base = withMonthlySalary(range(eur(400_000), eur(500_000), "salary-band"));
    const report = calculateCompensation(
      {
        ...base,
        fiscal: { ...base.fiscal, preTaxEmployeePensionAnnual: undefined },
      },
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );

    expect(report.fiscalPayroll.employeeDeductionsAnnual.kind).toBe("unknown");
    expect(report.fiscalPayroll.annualNetAfterSettlement.kind).toBe("range");
  });

  test("evaluates holiday-rate ranges as complete endpoint scenarios", () => {
    const base = syntheticCase();
    const withHolidayRate = (value: Value<{ readonly partsPerMillion: number }>) => ({
      ...base,
      employerPackage: {
        ...base.employerPackage,
        holidayPay: {
          ...base.employerPackage.holidayPay,
          rate: {
            ...base.employerPackage.holidayPay.rate,
            value,
          },
        },
      },
    });
    const lower = calculateCompensation(
      withHolidayRate({ kind: "exact", value: { partsPerMillion: 70_000 } }),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );
    const upper = calculateCompensation(
      withHolidayRate({ kind: "exact", value: { partsPerMillion: 90_000 } }),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );
    const rangedHolidayRate = calculateCompensation(
      withHolidayRate(
        range({ partsPerMillion: 70_000 }, { partsPerMillion: 90_000 }, "holiday-rate-band"),
      ),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );

    expect(rangedHolidayRate.normalization.guaranteedAnnualCash.kind).toBe("range");
    expectEndpoints(
      rangedHolidayRate.fiscalPayroll.annualNetThroughPayroll,
      lower.fiscalPayroll.annualNetThroughPayroll,
      upper.fiscalPayroll.annualNetThroughPayroll,
      "annual payroll net",
    );
    expect(rangedHolidayRate.fiscalPayroll.precision).toBe("estimated");
    expect(rangedHolidayRate.limitations).not.toContainEqual(
      expect.objectContaining({ code: "nl_fiscal_input_range_not_supported" }),
    );
  });

  test("evaluates fiscal input ranges even when guaranteed annual cash is exact", () => {
    const base = syntheticCase();
    const withTaxableBenefit = (value: Value<Money>) => ({
      ...base,
      fiscal: {
        ...base.fiscal,
        taxableBenefitAnnual: { ...base.fiscal.taxableBenefitAnnual!, value },
      },
    });
    const lower = calculateCompensation(withTaxableBenefit({ kind: "exact", value: eur(0) }), {
      engineVersion: "0.1.0",
      calculatedAt,
      rules: selectedRules(),
    });
    const upper = calculateCompensation(
      withTaxableBenefit({ kind: "exact", value: eur(1_000_000) }),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );
    const rangedTaxableBenefit = calculateCompensation(
      withTaxableBenefit(range(eur(0), eur(1_000_000), "taxable-benefit-band")),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );

    expect(rangedTaxableBenefit.normalization.guaranteedAnnualCash.kind).toBe("exact");
    expectEndpoints(
      rangedTaxableBenefit.fiscalPayroll.annualNetAfterSettlement,
      lower.fiscalPayroll.annualNetAfterSettlement,
      upper.fiscalPayroll.annualNetAfterSettlement,
      "taxable-benefit annual net",
    );
    expect(rangedTaxableBenefit.fiscalPayroll.precision).toBe("estimated");
  });

  test("ignores unrelated non-cash ranges when calculating a salary range", () => {
    const base = withMonthlySalary(range(eur(400_000), eur(500_000), "salary-band"));
    const evidence = syntheticCase().fiscal.taxableBenefitAnnual!;
    const report = calculateCompensation(
      {
        ...base,
        employerPackage: {
          ...base.employerPackage,
          nonCashBenefits: [
            {
              id: "education",
              label: "Education budget",
              kind: "other",
              employeeValue: {
                ...evidence,
                value: range(eur(100_000), eur(200_000), "education-band"),
              },
            },
          ],
        },
      },
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );

    expect(report.fiscalPayroll.normalPeriodNetSalary.kind).toBe("range");
    expect(report.limitations).not.toContainEqual(
      expect.objectContaining({ code: "nl_fiscal_input_range_not_supported" }),
    );
  });

  test("selects all minima and maxima across independent input ranges", () => {
    const base = syntheticCase();
    const evidence = syntheticCase().fiscal.taxableBenefitAnnual!;
    const withSalaryAndCash = (salary: Value<Money>, cash: Value<Money>) => ({
      ...base,
      employerPackage: {
        ...base.employerPackage,
        salaryExpressions: [
          {
            ...base.employerPackage.salaryExpressions[0]!,
            amount: { ...base.employerPackage.salaryExpressions[0]!.amount, value: salary },
          },
        ],
        cashComponents: [
          {
            id: "independent-cash",
            label: "Independent guaranteed cash",
            category: "guaranteed" as const,
            amount: {
              period: "annual" as const,
              amount: { ...evidence, value: cash },
            },
            includedInQuotedPay: {
              ...base.fiscal.underAowAge,
              value: { kind: "exact" as const, value: false },
            },
          },
        ],
      },
      firstYear: undefined,
    });
    const lower = calculateCompensation(
      withSalaryAndCash(
        { kind: "exact", value: eur(400_000) },
        { kind: "exact", value: eur(100_000) },
      ),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );
    const upper = calculateCompensation(
      withSalaryAndCash(
        { kind: "exact", value: eur(500_000) },
        { kind: "exact", value: eur(200_000) },
      ),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );
    const report = calculateCompensation(
      withSalaryAndCash(
        range(eur(400_000), eur(500_000), "salary-band"),
        range(eur(100_000), eur(200_000), "cash-band"),
      ),
      { engineVersion: "0.1.0", calculatedAt, rules: selectedRules() },
    );

    expectEndpoints(
      report.fiscalPayroll.annualNetThroughPayroll,
      lower.fiscalPayroll.annualNetThroughPayroll,
      upper.fiscalPayroll.annualNetThroughPayroll,
      "independent ranges annual payroll net",
    );
    expect(report.fiscalPayroll.precision).toBe("estimated");
    expect(report.limitations).not.toContainEqual(
      expect.objectContaining({ code: "nl_fiscal_multiple_range_correlations_not_supported" }),
    );
  });
});
