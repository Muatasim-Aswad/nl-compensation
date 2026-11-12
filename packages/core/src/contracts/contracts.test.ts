import { describe, expect, test } from "vite-plus/test";
import type { CompensationCaseInput } from "../model/compensation.js";
import type { Fact } from "../model/provenance.js";
import { eur, rational, roundRationalMoney } from "../model/scalars.js";
import { exact, range } from "../model/value.js";
import { compensationCaseJsonRoundTrip, parseCompensationCase } from "./input.js";
import { parseRuleDefinition } from "./rules.js";
import { parseMoney, parseMoneyValue } from "./scalars.js";
import { ContractValidationError, integer, record } from "./validation.js";

const explicitFact = <T>(value: T): Fact<T> => ({
  value: exact(value),
  origin: "offer",
  evidenceStatus: "explicit",
  validationState: "valid",
  source: { id: "synthetic-offer" },
  observedAt: "2026-08-16",
  locked: true,
});

const syntheticCase: CompensationCaseInput = {
  schemaVersion: "1",
  caseId: "synthetic-case",
  employerPackage: {
    salaryExpressions: [
      {
        amount: explicitFact(eur(460_000)),
        period: "monthly",
      },
      {
        amount: explicitFact(eur(2_650)),
        period: "hourly",
        weeklyHours: explicitFact({ kind: "standard", hours: 40 }),
      },
    ],
    actualWeeklyHours: explicitFact({ kind: "standard", hours: 40 }),
    employerFullTimeWeeklyHours: explicitFact({ kind: "standard", hours: 40 }),
    holidayPay: {
      inclusion: explicitFact("excluded"),
      rate: explicitFact({ partsPerMillion: 80_000 }),
      basis: explicitFact({ kind: "base_salary" }),
    },
    ikbComponents: [
      {
        id: "ikb-holiday",
        kind: "holiday_allowance",
        rate: explicitFact({ partsPerMillion: 80_000 }),
        includedInQuotedPay: explicitFact(false),
        guaranteed: explicitFact(true),
      },
    ],
    cashComponents: [
      {
        id: "year-end",
        label: "Guaranteed year-end payment",
        category: "guaranteed",
        amount: { amount: explicitFact(eur(460_000)), period: "annual" },
        includedInQuotedPay: explicitFact(false),
      },
      {
        id: "target-bonus",
        label: "Target bonus",
        category: "variable",
        amount: { amount: explicitFact(eur(300_000)), period: "annual" },
        probability: explicitFact({ partsPerMillion: 500_000 }),
        includedInQuotedPay: explicitFact(false),
      },
    ],
    pension: {
      employeeContribution: explicitFact(eur(15_000)),
      employerContribution: explicitFact(eur(30_000)),
      contributionPeriod: "monthly",
    },
    leave: { paidDaysPerYear: explicitFact(rational(27, 1)) },
    reimbursements: [
      {
        id: "travel",
        label: "Travel reimbursement",
        amount: { amount: explicitFact(eur(2_300)), period: "monthly" },
        taxable: explicitFact(false),
      },
    ],
    taxableBenefits: [
      {
        id: "car",
        label: "Company-car taxable value",
        taxableValue: { amount: explicitFact(eur(40_000)), period: "monthly" },
        cashPaidToEmployee: false,
      },
    ],
    nonCashBenefits: [
      {
        id: "equipment",
        label: "Equipment",
        kind: "equipment",
        employerCost: explicitFact(eur(150_000)),
      },
    ],
  },
  fiscal: {
    preTaxEmployeePensionAnnual: explicitFact(eur(180_000)),
    otherAnnualIncome: explicitFact(eur(0)),
    taxableBenefitAnnual: explicitFact(eur(480_000)),
    payrollTaxCreditApplied: explicitFact(true),
    postTaxEmployeeDeductionsPerPeriod: explicitFact(eur(5_000)),
    netReimbursementsPerPeriod: explicitFact(eur(2_300)),
    underAowAge: explicitFact(true),
    domesticTaxpayer: explicitFact(true),
  },
  household: {
    hasBenefitPartner: explicitFact(false),
    applicantInsuredForDutchHealthcare: explicitFact(true),
    applicantAssets: explicitFact(eur(100_000)),
    householdMembers: explicitFact(rational(1, 1)),
    children: explicitFact(rational(0, 1)),
    applicantAge: explicitFact(rational(32, 1)),
    kaleRentMonthly: explicitFact(eur(90_000)),
    householdAnnualIncome: explicitFact(eur(6_000_000)),
  },
  firstYear: {
    calendarYear: 2026,
    jobStartDate: explicitFact("2026-04-01"),
    incomeBeforeStart: explicitFact(eur(1_200_000)),
    firstPaymentDate: explicitFact("2026-04-25"),
    regularPaymentDay: explicitFact(rational(25, 1)),
    holidayPaymentMonth: explicitFact(rational(5, 1)),
  },
};

describe("money and range contracts", () => {
  test("accepts integer euro cents without floating-point normalization", () => {
    expect(parseMoney({ amountCents: 123_456, currency: "EUR" })).toEqual(eur(123_456));
    expect(() => parseMoney({ amountCents: 1.5, currency: "EUR" })).toThrow(
      ContractValidationError,
    );
  });

  test("preserves correlated ranges and rejects reversed bounds", () => {
    const value = range(eur(100_000), eur(125_000), "offer-band");
    expect(parseMoneyValue(JSON.parse(JSON.stringify(value)) as unknown)).toEqual(value);
    expect(() =>
      parseMoneyValue({
        kind: "range",
        min: eur(200),
        max: eur(100),
        correlationId: "bad-range",
      }),
    ).toThrow(/minimum must not exceed maximum/);
  });

  test("rejects an incompatible currency unit", () => {
    expect(() => parseMoney({ amountCents: 100, currency: "USD" })).toThrow(
      /only EUR money is supported/,
    );
  });
});

describe("rounding contracts", () => {
  test("rounds exact rational results under an explicit policy", () => {
    expect(
      roundRationalMoney(eur(1_005), rational(1, 10), {
        unit: "cent",
        mode: "half_away_from_zero",
      }),
    ).toEqual(eur(101));
    expect(
      roundRationalMoney(eur(-1_005), rational(1, 10), {
        unit: "cent",
        mode: "half_away_from_zero",
      }),
    ).toEqual(eur(-101));
    expect(
      roundRationalMoney(eur(19_950), rational(1, 1), {
        unit: "euro",
        mode: "floor",
      }),
    ).toEqual(eur(19_900));
  });
});

describe("versioned compensation input", () => {
  test("round-trips canonical JSON without losing provenance dimensions", () => {
    const parsed = compensationCaseJsonRoundTrip(syntheticCase);
    expect(parsed).toEqual(syntheticCase);
    expect(parsed.employerPackage.salaryExpressions[0]?.amount).toMatchObject({
      origin: "offer",
      evidenceStatus: "explicit",
      validationState: "valid",
      locked: true,
    });
  });

  test("rejects hourly pay without its hours unit", () => {
    const raw = JSON.parse(JSON.stringify(syntheticCase)) as Record<string, unknown>;
    const employerPackage = raw.employerPackage as Record<string, unknown>;
    const expressions = employerPackage.salaryExpressions as Record<string, unknown>[];
    delete expressions[1]?.weeklyHours;
    expect(() => parseCompensationCase(raw)).toThrow(/hourly pay requires a weekly-hours basis/);
  });

  test("rejects an unknown schema version", () => {
    expect(() => parseCompensationCase({ ...syntheticCase, schemaVersion: "2" })).toThrow(
      /expected schema version 1/,
    );
  });
});

describe("immutable rule definition contract", () => {
  test("round-trips versioned provenance and validates typed parameters", () => {
    const rule = {
      schemaVersion: "1",
      id: "synthetic-rule-2026-r1",
      legalFrom: "2026-01-01",
      effectiveFrom: "2026-01-01",
      verifiedAt: "2026-08-16",
      sources: [
        {
          title: "Synthetic official example",
          url: "https://example.invalid/official",
          publicationDate: "2025-12-01",
          effectiveFrom: "2026-01-01",
          checkedAt: "2026-08-16",
          contentHash: "sha256:source",
        },
      ],
      contentHash: "sha256:rule",
      parameters: { thresholdCents: 100_000 },
    };
    const parsed = parseRuleDefinition(rule, (input, path = "parameters") => {
      const value = record(input, path);
      return { thresholdCents: integer(value.thresholdCents, `${path}.thresholdCents`) };
    });
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(rule);
  });
});
