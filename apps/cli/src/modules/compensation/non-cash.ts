import {
  exact,
  unknown,
  type CompensationCaseInput,
  type CompensationReport,
  type Precision,
} from "@nl-compensation/core";
import { annualFactMoney, exactFact, noMoney, rationalNumber } from "./values.js";

export function nonCashReport(input: CompensationCaseInput): {
  report: CompensationReport["nonCash"];
  completeness: CompensationReport["completeness"][number];
} {
  const employerPension = annualFactMoney(
    input.employerPackage.pension?.employerContribution,
    input.employerPackage.pension?.contributionPeriod,
  );
  const leave = rationalNumber(exactFact(input.employerPackage.leave?.paidDaysPerYear));
  const benefits = input.employerPackage.nonCashBenefits.map((benefit) => {
    const value = exactFact(benefit.employeeValue) ?? exactFact(benefit.employerCost);
    return {
      id: benefit.id,
      label: benefit.label,
      value: value === undefined ? noMoney() : exact(value),
    };
  });
  const missing = [
    ...(employerPension === undefined ? ["employerPackage.pension.employerContribution"] : []),
    ...(leave === undefined ? ["employerPackage.leave.paidDaysPerYear"] : []),
    ...benefits
      .filter((benefit) => benefit.value.kind === "unknown")
      .map((benefit) => `employerPackage.nonCashBenefits.${benefit.id}.value`),
  ];
  const precision: Precision = missing.length === 0 ? "exact" : "unavailable";
  return {
    report: {
      precision,
      pensionEmployerContribution:
        employerPension === undefined ? noMoney() : exact(employerPension),
      paidLeaveDays: leave === undefined ? unknown("not_provided") : exact(leave),
      benefits,
    },
    completeness: {
      layer: "non_cash",
      precision,
      missingInputs: missing,
      unsupportedReasons: [],
    },
  };
}
