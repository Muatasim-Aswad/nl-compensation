import type { EmployerPackageInput } from "../model/compensation.js";
import type { Fact } from "../model/provenance.js";
import { eur, rational } from "../model/scalars.js";
import { exact } from "../model/value.js";

export function syntheticExplicitFact<T>(value: T, locked = true): Fact<T> {
  return {
    value: exact(value),
    origin: "offer",
    evidenceStatus: "explicit",
    validationState: "valid",
    source: { id: "synthetic-offer" },
    observedAt: "2026-08-16",
    locked,
  };
}

/** Synthetic fixture for the documented €4,600 normalization golden case. */
export function syntheticMonthlyOffer(): EmployerPackageInput {
  return {
    salaryExpressions: [{ amount: syntheticExplicitFact(eur(460_000)), period: "monthly" }],
    actualWeeklyHours: syntheticExplicitFact({ kind: "standard", hours: 40 }),
    employerFullTimeWeeklyHours: syntheticExplicitFact({ kind: "standard", hours: 40 }),
    holidayPay: {
      inclusion: syntheticExplicitFact("excluded"),
      rate: syntheticExplicitFact({ partsPerMillion: 80_000 }),
      basis: syntheticExplicitFact({ kind: "base_salary" }),
    },
    ikbComponents: [],
    cashComponents: [],
    pension: undefined,
    leave: { paidDaysPerYear: syntheticExplicitFact(rational(25, 1)) },
    reimbursements: [],
    taxableBenefits: [],
    nonCashBenefits: [],
  };
}
