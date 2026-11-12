import { normalizeEmployerPackage } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import {
  choiceFact,
  initialScenario,
  numberFact,
  scenarioAtRangeSelection,
  scenarioReducer,
  toCompensationCase,
  type ScenarioDraft,
} from "./scenario.js";

function normalize(scenario: ScenarioDraft) {
  return normalizeEmployerPackage(toCompensationCase(scenario).employerPackage);
}

describe("open-form interactions", () => {
  test("bidirectional salary edits derive every compatible unit", () => {
    const edited = scenarioReducer(initialScenario, {
      type: "patch",
      path: ["salaries", 0, "amount"],
      patch: { exact: 60_000 },
    });
    const annual = scenarioReducer(edited, {
      type: "patch",
      path: ["salaries", 0],
      patch: { period: "annual" },
    });
    const result = normalize(annual);

    expect(result.salarySolution.representations.map((item) => item.period)).toEqual([
      "annual",
      "monthly",
      "four_weekly",
      "hourly",
    ]);
    expect(
      result.salarySolution.representations.find((item) => item.period === "monthly")?.amount,
    ).toMatchObject({ kind: "exact", value: { amountCents: 500_000 } });
  });

  test("ranges remain ranges through GAC normalization", () => {
    const ranged = scenarioReducer(initialScenario, {
      type: "patch",
      path: ["salaries", 0, "amount"],
      patch: { mode: "range", min: 4_000, max: 5_000 },
    });
    expect(normalize(ranged).report.guaranteedAnnualCash.kind).toBe("range");
  });

  test("range selections resolve every numeric input before normalization without mutation", () => {
    const ranged: ScenarioDraft = {
      ...initialScenario,
      salaries: [
        {
          ...initialScenario.salaries[0]!,
          amount: {
            ...initialScenario.salaries[0]!.amount,
            mode: "range",
            min: 4_000,
            max: 5_000,
          },
        },
      ],
      holidayRate: { ...initialScenario.holidayRate, mode: "range", min: 7, max: 9 },
      educationBudget: {
        ...initialScenario.educationBudget,
        mode: "range",
        min: 1_000,
        max: 2_000,
      },
      travelReimbursement: {
        ...initialScenario.travelReimbursement,
        mode: "range",
        min: 100,
        max: 300,
      },
    };

    const minimum = scenarioAtRangeSelection(ranged, "minimum");
    const maximum = scenarioAtRangeSelection(ranged, "maximum");
    const average = scenarioAtRangeSelection(ranged, "average");

    expect(minimum.salaries[0]?.amount).toMatchObject({ mode: "exact", exact: 4_000 });
    expect(maximum.salaries[0]?.amount).toMatchObject({ mode: "exact", exact: 5_000 });
    expect(average.salaries[0]?.amount).toMatchObject({ mode: "exact", exact: 4_500 });
    expect(average.holidayRate).toMatchObject({ mode: "exact", exact: 8 });
    expect(average.educationBudget).toMatchObject({ mode: "exact", exact: 1_500 });
    expect(average.travelReimbursement).toMatchObject({ mode: "exact", exact: 200 });
    expect(toCompensationCase(average).employerPackage.salaryExpressions[0]?.amount.value).toEqual({
      kind: "exact",
      value: { currency: "EUR", amountCents: 450_000 },
    });
    expect(ranged.salaries[0]?.amount.mode).toBe("range");
    expect(ranged.educationBudget.mode).toBe("range");
  });

  test("conflicting locked salary facts remain visible with a hard diagnostic", () => {
    const secondSalary: ScenarioDraft = {
      ...initialScenario,
      salaries: [
        ...initialScenario.salaries,
        { id: "salary-2", amount: numberFact(80_000, { locked: true }), period: "annual" },
      ],
    };
    const result = normalize(secondSalary);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "locked_salary_conflict" })]),
    );
    expect(result.report.guaranteedAnnualCash.kind).toBe("unknown");
  });

  test("an IKB holiday component does not double count holiday allowance", () => {
    const ikbScenario: ScenarioDraft = {
      ...initialScenario,
      ikb: [
        {
          id: "ikb-holiday",
          kind: "holiday_allowance",
          rate: numberFact(8),
          includedInQuotedPay: choiceFact(false),
          guaranteed: choiceFact(true),
        },
      ],
    };
    const result = normalize(ikbScenario);
    expect(
      result.report.guaranteedBreakdown.filter((item) => item.componentId === "holiday_allowance"),
    ).toHaveLength(1);
    expect(result.report.guaranteedAnnualCash).toMatchObject({
      kind: "exact",
      value: { amountCents: 5_961_600 },
    });
  });

  test("a guaranteed 13th month is separate from monthly base and holiday allowance", () => {
    const scenario: ScenarioDraft = {
      ...initialScenario,
      thirteenthMonth: {
        offered: choiceFact(true),
        amountMode: "custom",
        amount: numberFact(4_600),
        includedInQuotedPay: choiceFact(false),
      },
    };
    const result = normalize(scenario);

    expect(result.report.guaranteedBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "thirteenth-month",
          annualAmount: { kind: "exact", value: { currency: "EUR", amountCents: 460_000 } },
        }),
      ]),
    );
    expect(result.report.guaranteedAnnualCash).toMatchObject({
      kind: "exact",
      value: { amountCents: 6_421_600 },
    });
  });

  test("an annual quote can include holiday allowance and a 13th month", () => {
    const scenario: ScenarioDraft = {
      ...initialScenario,
      salaries: [{ id: "salary-annual", amount: numberFact(59_000), period: "annual" }],
      holidayInclusion: choiceFact("included"),
      thirteenthMonth: {
        offered: choiceFact(true),
        amountMode: "custom",
        amount: numberFact(5_000),
        includedInQuotedPay: choiceFact(true),
      },
    };
    const result = normalize(scenario);
    const base = result.report.guaranteedBreakdown.find(
      (item) => item.componentId === "base_salary",
    );

    expect(base?.annualAmount).toMatchObject({
      kind: "exact",
      value: { amountCents: 5_000_000 },
    });
    expect(result.report.guaranteedAnnualCash).toMatchObject({
      kind: "exact",
      value: { amountCents: 5_900_000 },
    });
  });

  test("a standard 13th month follows one normalized gross base month", () => {
    const offered: ScenarioDraft = {
      ...initialScenario,
      thirteenthMonth: {
        ...initialScenario.thirteenthMonth,
        offered: choiceFact(true),
      },
    };
    const initial = normalize(offered);
    expect(
      initial.report.guaranteedBreakdown.find(
        (component) => component.componentId === "thirteenth-month",
      )?.annualAmount,
    ).toMatchObject({ kind: "exact", value: { amountCents: 460_000 } });

    const raised = scenarioReducer(offered, {
      type: "patch",
      path: ["salaries", 0, "amount"],
      patch: { exact: 5_000 },
    });
    expect(
      normalize(raised).report.guaranteedBreakdown.find(
        (component) => component.componentId === "thirteenth-month",
      )?.annualAmount,
    ).toMatchObject({ kind: "exact", value: { amountCents: 500_000 } });
  });

  test("a ranged standard 13th month keeps the salary range correlation", () => {
    const rangedSalary = scenarioReducer(initialScenario, {
      type: "patch",
      path: ["salaries", 0, "amount"],
      patch: { mode: "range", min: 4_000, max: 5_000 },
    });
    const offered: ScenarioDraft = {
      ...rangedSalary,
      thirteenthMonth: {
        ...rangedSalary.thirteenthMonth,
        offered: choiceFact(true),
      },
    };
    const input = toCompensationCase(offered);
    const salaryValue = input.employerPackage.salaryExpressions[0]!.amount.value;
    const thirteenthValue = input.employerPackage.cashComponents.find(
      (component) => component.id === "thirteenth-month",
    )?.amount.amount.value;

    expect(salaryValue.kind).toBe("range");
    expect(thirteenthValue?.kind).toBe("range");
    if (salaryValue.kind === "range" && thirteenthValue?.kind === "range") {
      expect(thirteenthValue.correlationId).toBe(salaryValue.correlationId);
    }
  });

  test("an included standard 13th month derives from the solved annual base", () => {
    const scenario: ScenarioDraft = {
      ...initialScenario,
      salaries: [{ id: "salary-annual", amount: numberFact(69_800), period: "annual" }],
      holidayInclusion: choiceFact("included"),
      thirteenthMonth: {
        ...initialScenario.thirteenthMonth,
        offered: choiceFact(true),
        includedInQuotedPay: choiceFact(true),
      },
    };
    const result = normalize(scenario);

    expect(
      result.report.guaranteedBreakdown.find((component) => component.componentId === "base_salary")
        ?.annualAmount,
    ).toMatchObject({ kind: "exact", value: { amountCents: 6_000_000 } });
    expect(
      result.report.guaranteedBreakdown.find(
        (component) => component.componentId === "thirteenth-month",
      )?.annualAmount,
    ).toMatchObject({ kind: "exact", value: { amountCents: 500_000 } });
  });

  test("the web case fixes other annual income at zero", () => {
    expect(toCompensationCase(initialScenario).fiscal.otherAnnualIncome).toMatchObject({
      value: { kind: "exact", value: { currency: "EUR", amountCents: 0 } },
      locked: true,
    });
  });

  test("fast education and travel facts map once into the shared report input", () => {
    const withEducation = scenarioReducer(initialScenario, {
      type: "patch",
      path: ["educationBudget"],
      patch: { mode: "exact", exact: 1_500 },
    });
    const scenario = scenarioReducer(withEducation, {
      type: "patch",
      path: ["travelReimbursement"],
      patch: { mode: "exact", exact: 225 },
    });
    const input = toCompensationCase(scenario);

    expect(
      input.employerPackage.nonCashBenefits.filter((item) => item.id === "education-budget"),
    ).toEqual([
      expect.objectContaining({
        label: "Education budget",
        employeeValue: expect.objectContaining({
          value: { kind: "exact", value: { currency: "EUR", amountCents: 150_000 } },
        }),
      }),
    ]);
    expect(
      input.employerPackage.reimbursements.filter((item) => item.id === "travel-reimbursement"),
    ).toEqual([
      expect.objectContaining({
        amount: expect.objectContaining({
          period: "monthly",
          amount: expect.objectContaining({
            value: { kind: "exact", value: { currency: "EUR", amountCents: 22_500 } },
          }),
        }),
      }),
    ]);
    expect(input.fiscal.netReimbursementsPerPeriod).toMatchObject({
      value: { kind: "exact", value: { currency: "EUR", amountCents: 22_500 } },
    });
  });

  test("generic reimbursements and non-cash benefits remain separate", () => {
    const withReimbursement = scenarioReducer(initialScenario, {
      type: "add-reimbursement",
    });
    const scenario = scenarioReducer(withReimbursement, {
      type: "add-benefit",
      taxable: false,
    });
    const input = toCompensationCase(scenario);

    expect(input.employerPackage.reimbursements).toHaveLength(2);
    expect(input.employerPackage.nonCashBenefits).toHaveLength(2);
  });

  test("travel reimbursement follows a four-weekly primary payroll period", () => {
    const fourWeekly = scenarioReducer(initialScenario, {
      type: "patch",
      path: ["salaries", 0],
      patch: { period: "four_weekly" },
    });
    const scenario = scenarioReducer(fourWeekly, {
      type: "patch",
      path: ["travelReimbursement"],
      patch: { mode: "exact", exact: 200 },
    });
    const input = toCompensationCase(scenario);

    expect(
      input.employerPackage.reimbursements.find((item) => item.id === "travel-reimbursement")
        ?.amount,
    ).toMatchObject({
      period: "four_weekly",
      amount: {
        value: { kind: "exact", value: { currency: "EUR", amountCents: 20_000 } },
      },
    });
    expect(input.fiscal.netReimbursementsPerPeriod).toMatchObject({
      value: { kind: "exact", value: { currency: "EUR", amountCents: 20_000 } },
    });
  });

  test("unknown facts remain explicit in completeness", () => {
    const unknownHoliday = scenarioReducer(initialScenario, {
      type: "patch",
      path: ["holidayRate"],
      patch: { mode: "unknown", unknownReason: "not_known" },
    });
    expect(normalize(unknownHoliday).completeness.missingInputs).toContain(
      "employerPackage.holidayPay.rate",
    );
  });
});
