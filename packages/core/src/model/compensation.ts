import type { Fact } from "./provenance.js";
import type { Money, Rational, ScaledPercentage } from "./scalars.js";

export const PAY_PERIODS = ["monthly", "four_weekly", "hourly", "annual"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export type StandardWeeklyHours = 36 | 38 | 40;
export type WeeklyHours =
  | { readonly kind: "standard"; readonly hours: StandardWeeklyHours }
  | { readonly kind: "custom"; readonly hours: Rational };

export interface PayExpression {
  readonly amount: Fact<Money>;
  readonly period: PayPeriod;
  /** Required for hourly expressions; explicit elsewhere when it disambiguates a quote. */
  readonly weeklyHours?: Fact<WeeklyHours>;
}

export type HolidayPayInclusion = "included" | "excluded" | "unknown";
export type HolidayPayBasis =
  | { readonly kind: "base_salary" }
  | { readonly kind: "component_ids"; readonly componentIds: readonly string[] }
  | { readonly kind: "unknown" };

export interface HolidayPayTerms {
  readonly inclusion: Fact<HolidayPayInclusion>;
  readonly rate: Fact<ScaledPercentage>;
  readonly basis: Fact<HolidayPayBasis>;
}

export type IkbComponentKind = "holiday_allowance" | "year_end_payment" | "other";

export interface IkbComponent {
  readonly id: string;
  readonly kind: IkbComponentKind;
  readonly amount?: Fact<Money>;
  readonly rate?: Fact<ScaledPercentage>;
  readonly includedInQuotedPay: Fact<boolean>;
  readonly guaranteed: Fact<boolean>;
}

export type CashComponentCategory = "guaranteed" | "variable";

export interface CashComponent {
  readonly id: string;
  readonly label: string;
  readonly category: CashComponentCategory;
  readonly amount: PayExpression;
  readonly probability?: Fact<ScaledPercentage>;
  readonly includedInQuotedPay: Fact<boolean>;
}

export interface PensionInputs {
  readonly employeeContribution?: Fact<Money>;
  readonly employerContribution?: Fact<Money>;
  readonly contributionPeriod?: PayPeriod;
  readonly pensionableSalary?: Fact<Money>;
  readonly premiumSplit?: Fact<ScaledPercentage>;
  readonly accrualValue?: Fact<Money>;
}

export interface LeaveInputs {
  readonly paidDaysPerYear?: Fact<Rational>;
  readonly statutoryDaysPerYear?: Fact<Rational>;
  readonly purchasedDaysPerYear?: Fact<Rational>;
}

export interface Reimbursement {
  readonly id: string;
  readonly label: string;
  readonly amount: PayExpression;
  readonly taxable: Fact<boolean>;
}

export interface TaxableBenefit {
  readonly id: string;
  readonly label: string;
  readonly taxableValue: PayExpression;
  readonly cashPaidToEmployee: false;
}

export interface NonCashBenefit {
  readonly id: string;
  readonly label: string;
  readonly kind: "pension" | "leave" | "insurance" | "equipment" | "equity" | "other";
  readonly employerCost?: Fact<Money>;
  readonly employeeValue?: Fact<Money>;
}

export interface EmployerPackageInput {
  readonly salaryExpressions: readonly PayExpression[];
  readonly actualWeeklyHours: Fact<WeeklyHours>;
  readonly employerFullTimeWeeklyHours: Fact<WeeklyHours>;
  readonly holidayPay: HolidayPayTerms;
  readonly ikbComponents: readonly IkbComponent[];
  readonly cashComponents: readonly CashComponent[];
  readonly pension?: PensionInputs;
  readonly leave?: LeaveInputs;
  readonly reimbursements: readonly Reimbursement[];
  readonly taxableBenefits: readonly TaxableBenefit[];
  readonly nonCashBenefits: readonly NonCashBenefit[];
}

export interface FiscalInputs {
  readonly preTaxEmployeePensionAnnual?: Fact<Money>;
  readonly otherAnnualIncome?: Fact<Money>;
  readonly taxableBenefitAnnual?: Fact<Money>;
  readonly payrollTaxCreditApplied?: Fact<boolean>;
  readonly additionalWithholdingAnnual?: Fact<Money>;
  /** Deductions taken from each normal payslip after tax, such as a staff association fee. */
  readonly postTaxEmployeeDeductionsPerPeriod?: Fact<Money>;
  /** Net reimbursements expected in each normal salary payment. */
  readonly netReimbursementsPerPeriod?: Fact<Money>;
  readonly underAowAge: Fact<boolean>;
  readonly domesticTaxpayer: Fact<boolean>;
}

export interface HouseholdInputs {
  readonly hasBenefitPartner: Fact<boolean>;
  readonly partnerAnnualIncome?: Fact<Money>;
  readonly applicantInsuredForDutchHealthcare: Fact<boolean>;
  readonly partnerInsuredForDutchHealthcare?: Fact<boolean>;
  readonly applicantAssets?: Fact<Money>;
  readonly partnerAssets?: Fact<Money>;
  readonly householdMembers: Fact<Rational>;
  readonly children: Fact<Rational>;
  readonly applicantAge: Fact<Rational>;
  readonly partnerAge?: Fact<Rational>;
  readonly kaleRentMonthly?: Fact<Money>;
  readonly householdAnnualIncome?: Fact<Money>;
}

export interface FirstYearContext {
  readonly calendarYear: number;
  readonly jobStartDate: Fact<string>;
  readonly incomeBeforeStart?: Fact<Money>;
  readonly priorEmployerWithholding?: Fact<Money>;
  readonly firstPaymentDate?: Fact<string>;
  readonly regularPaymentDay?: Fact<Rational>;
  readonly holidayPaymentMonth?: Fact<Rational>;
  readonly bonusPaymentDates?: readonly Fact<string>[];
}

export interface CompensationCaseInput {
  readonly schemaVersion: "1";
  readonly caseId?: string;
  readonly employerPackage: EmployerPackageInput;
  readonly fiscal: FiscalInputs;
  readonly household: HouseholdInputs;
  readonly firstYear?: FirstYearContext;
}
