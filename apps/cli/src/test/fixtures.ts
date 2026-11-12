import { eur, rational, type CompensationCaseInput } from "@nl-compensation/core";
import { syntheticExplicitFact, syntheticMonthlyOffer } from "@nl-compensation/core/testing";

export function syntheticCase(caseId = "synthetic-cli-case"): CompensationCaseInput {
  return {
    schemaVersion: "1",
    caseId,
    employerPackage: syntheticMonthlyOffer(),
    fiscal: {
      preTaxEmployeePensionAnnual: syntheticExplicitFact(eur(180_000)),
      otherAnnualIncome: syntheticExplicitFact(eur(0)),
      taxableBenefitAnnual: syntheticExplicitFact(eur(0)),
      payrollTaxCreditApplied: syntheticExplicitFact(true),
      additionalWithholdingAnnual: syntheticExplicitFact(eur(0)),
      postTaxEmployeeDeductionsPerPeriod: syntheticExplicitFact(eur(0)),
      netReimbursementsPerPeriod: syntheticExplicitFact(eur(0)),
      underAowAge: syntheticExplicitFact(true),
      domesticTaxpayer: syntheticExplicitFact(true),
    },
    household: {
      hasBenefitPartner: syntheticExplicitFact(false),
      applicantInsuredForDutchHealthcare: syntheticExplicitFact(true),
      applicantAssets: syntheticExplicitFact(eur(100_000)),
      householdMembers: syntheticExplicitFact(rational(1, 1)),
      children: syntheticExplicitFact(rational(0, 1)),
      applicantAge: syntheticExplicitFact(rational(32, 1)),
      kaleRentMonthly: syntheticExplicitFact(eur(80_000)),
      householdAnnualIncome: syntheticExplicitFact(eur(5_781_600)),
    },
    firstYear: {
      calendarYear: 2026,
      jobStartDate: syntheticExplicitFact("2026-07-01"),
      incomeBeforeStart: syntheticExplicitFact(eur(2_000_000)),
      priorEmployerWithholding: syntheticExplicitFact(eur(300_000)),
    },
  };
}
