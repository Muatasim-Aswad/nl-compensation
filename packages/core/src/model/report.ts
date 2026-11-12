import type { Assumption, DerivationStep } from "./provenance.js";
import type { RuleSelection } from "./rules.js";
import type { Money } from "./scalars.js";
import type { Value } from "./value.js";

export const PRECISION_LEVELS = ["exact", "estimated", "unsupported", "unavailable"] as const;
export type Precision = (typeof PRECISION_LEVELS)[number];
export type ReportLayer = "normalization" | "fiscal_payroll" | "household" | "non_cash";

export interface Completeness {
  readonly layer: ReportLayer;
  readonly precision: Precision;
  readonly missingInputs: readonly string[];
  readonly unsupportedReasons: readonly string[];
}

export interface Limitation {
  readonly code: string;
  readonly layer: ReportLayer;
  readonly message: string;
  readonly affectedOutputs: readonly string[];
}

export interface GuaranteedCashBreakdownItem {
  readonly componentId: string;
  readonly label: string;
  readonly annualAmount: Value<Money>;
}

export interface NormalizationReport {
  readonly precision: Precision;
  readonly guaranteedAnnualCash: Value<Money>;
  readonly guaranteedAnnualCashAtActualHours: Value<Money>;
  readonly guaranteedAnnualCashAt40Hours: Value<Money>;
  readonly nominalHourlyEquivalent: Value<Money>;
  readonly guaranteedBreakdown: readonly GuaranteedCashBreakdownItem[];
  readonly expectedVariableCash: Value<Money>;
}

export interface FiscalPayrollReport {
  readonly precision: Precision;
  readonly regularPayPeriod: "monthly" | "four_weekly";
  readonly fiscalWageAnnual: Value<Money>;
  readonly employeeDeductionsAnnual: Value<Money>;
  readonly finalIncomeTaxAnnual: Value<Money>;
  readonly payrollWithholdingRegular: Value<Money>;
  readonly specialPaymentWithholding: Value<Money>;
  readonly normalPeriodGross: Value<Money>;
  readonly normalPeriodPreTaxDeduction: Value<Money>;
  readonly normalPeriodAdditionalWithholding: Value<Money>;
  readonly normalPeriodPostTaxDeduction: Value<Money>;
  readonly normalPeriodNetSalary: Value<Money>;
  readonly normalPeriodNetToBank: Value<Money>;
  readonly specialPayments: readonly {
    readonly componentId: string;
    readonly label: string;
    readonly gross: Value<Money>;
    readonly withholding: Value<Money>;
    readonly netPayment: Value<Money>;
    readonly estimatedPeriodNetToBank: Value<Money>;
  }[];
  readonly annualNetThroughPayroll: Value<Money>;
  readonly annualNetAfterSettlement: Value<Money>;
  readonly averageMonthlyNet: Value<Money>;
  readonly possibleSettlement: Value<Money>;
}

export interface HouseholdPeriodReport {
  readonly precision: Precision;
  readonly toetsingsinkomen: Value<Money>;
  readonly zorgtoeslagAnnual: Value<Money>;
  readonly huurtoeslagAnnual: Value<Money>;
  readonly spendableIncomeAnnual: Value<Money>;
}

export interface HouseholdReport {
  readonly firstCalendarYear?: HouseholdPeriodReport;
  readonly steadyState: HouseholdPeriodReport;
}

export interface NonCashReport {
  readonly precision: Precision;
  readonly pensionEmployerContribution: Value<Money>;
  readonly paidLeaveDays: Value<number>;
  readonly benefits: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: Value<Money>;
  }[];
}

export interface CompensationReport {
  readonly schemaVersion: "1";
  readonly engineVersion: string;
  /** Supplied by the caller so the core does not read a clock. */
  readonly calculatedAt: string;
  readonly caseId?: string;
  readonly selectedRules: RuleSelection;
  readonly normalization: NormalizationReport;
  readonly fiscalPayroll: FiscalPayrollReport;
  readonly household: HouseholdReport;
  readonly nonCash: NonCashReport;
  readonly completeness: readonly Completeness[];
  readonly assumptions: readonly Assumption[];
  readonly limitations: readonly Limitation[];
  readonly derivationTrace: readonly DerivationStep[];
}
