import type {
  CompensationReport,
  Completeness,
  FiscalPayrollReport,
  GuaranteedCashBreakdownItem,
  HouseholdPeriodReport,
  HouseholdReport,
  NonCashReport,
  NormalizationReport,
  Precision,
} from "../model/report.js";
import { PRECISION_LEVELS } from "../model/report.js";
import { parseRuleSelection } from "./rules.js";
import { parseMoneyValue, valueParser } from "./scalars.js";
import { array, enumeration, record, string, type Parser } from "./validation.js";

const parseString: Parser<string> = (input, path = "value") => string(input, path);

const parseNumber: Parser<number> = (input, path = "value") => {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new TypeError(`${path}: expected a finite number`);
  }
  return input;
};

const parseNumberValue = valueParser(parseNumber, (left, right) => left - right);

const parsePrecision = (input: unknown, path: string): Precision =>
  enumeration(input, PRECISION_LEVELS, path);

function parseStringArray(input: unknown, path: string): readonly string[] {
  return array(input, parseString, path);
}

function parseBreakdownItem(input: unknown, path = "breakdownItem"): GuaranteedCashBreakdownItem {
  const value = record(input, path);
  return {
    componentId: string(value.componentId, `${path}.componentId`),
    label: string(value.label, `${path}.label`),
    annualAmount: parseMoneyValue(value.annualAmount, `${path}.annualAmount`),
  };
}

function parseNormalization(input: unknown, path: string): NormalizationReport {
  const value = record(input, path);
  return {
    precision: parsePrecision(value.precision, `${path}.precision`),
    guaranteedAnnualCash: parseMoneyValue(
      value.guaranteedAnnualCash,
      `${path}.guaranteedAnnualCash`,
    ),
    guaranteedAnnualCashAtActualHours: parseMoneyValue(
      value.guaranteedAnnualCashAtActualHours,
      `${path}.guaranteedAnnualCashAtActualHours`,
    ),
    guaranteedAnnualCashAt40Hours: parseMoneyValue(
      value.guaranteedAnnualCashAt40Hours,
      `${path}.guaranteedAnnualCashAt40Hours`,
    ),
    nominalHourlyEquivalent: parseMoneyValue(
      value.nominalHourlyEquivalent,
      `${path}.nominalHourlyEquivalent`,
    ),
    guaranteedBreakdown: array(
      value.guaranteedBreakdown,
      parseBreakdownItem,
      `${path}.guaranteedBreakdown`,
    ),
    expectedVariableCash: parseMoneyValue(
      value.expectedVariableCash,
      `${path}.expectedVariableCash`,
    ),
  };
}

function parseFiscalPayroll(input: unknown, path: string): FiscalPayrollReport {
  const value = record(input, path);
  return {
    precision: parsePrecision(value.precision, `${path}.precision`),
    regularPayPeriod: enumeration(
      value.regularPayPeriod,
      ["monthly", "four_weekly"] as const,
      `${path}.regularPayPeriod`,
    ),
    fiscalWageAnnual: parseMoneyValue(value.fiscalWageAnnual, `${path}.fiscalWageAnnual`),
    employeeDeductionsAnnual: parseMoneyValue(
      value.employeeDeductionsAnnual,
      `${path}.employeeDeductionsAnnual`,
    ),
    finalIncomeTaxAnnual: parseMoneyValue(
      value.finalIncomeTaxAnnual,
      `${path}.finalIncomeTaxAnnual`,
    ),
    payrollWithholdingRegular: parseMoneyValue(
      value.payrollWithholdingRegular,
      `${path}.payrollWithholdingRegular`,
    ),
    specialPaymentWithholding: parseMoneyValue(
      value.specialPaymentWithholding,
      `${path}.specialPaymentWithholding`,
    ),
    normalPeriodGross: parseMoneyValue(value.normalPeriodGross, `${path}.normalPeriodGross`),
    normalPeriodPreTaxDeduction: parseMoneyValue(
      value.normalPeriodPreTaxDeduction,
      `${path}.normalPeriodPreTaxDeduction`,
    ),
    normalPeriodAdditionalWithholding: parseMoneyValue(
      value.normalPeriodAdditionalWithholding,
      `${path}.normalPeriodAdditionalWithholding`,
    ),
    normalPeriodPostTaxDeduction: parseMoneyValue(
      value.normalPeriodPostTaxDeduction,
      `${path}.normalPeriodPostTaxDeduction`,
    ),
    normalPeriodNetSalary: parseMoneyValue(
      value.normalPeriodNetSalary,
      `${path}.normalPeriodNetSalary`,
    ),
    normalPeriodNetToBank: parseMoneyValue(
      value.normalPeriodNetToBank,
      `${path}.normalPeriodNetToBank`,
    ),
    specialPayments: array(
      value.specialPayments,
      (item, itemPath = "specialPayment") => {
        const payment = record(item, itemPath);
        return {
          componentId: string(payment.componentId, `${itemPath}.componentId`),
          label: string(payment.label, `${itemPath}.label`),
          gross: parseMoneyValue(payment.gross, `${itemPath}.gross`),
          withholding: parseMoneyValue(payment.withholding, `${itemPath}.withholding`),
          netPayment: parseMoneyValue(payment.netPayment, `${itemPath}.netPayment`),
          estimatedPeriodNetToBank: parseMoneyValue(
            payment.estimatedPeriodNetToBank,
            `${itemPath}.estimatedPeriodNetToBank`,
          ),
        };
      },
      `${path}.specialPayments`,
    ),
    annualNetThroughPayroll: parseMoneyValue(
      value.annualNetThroughPayroll,
      `${path}.annualNetThroughPayroll`,
    ),
    annualNetAfterSettlement: parseMoneyValue(
      value.annualNetAfterSettlement,
      `${path}.annualNetAfterSettlement`,
    ),
    averageMonthlyNet: parseMoneyValue(value.averageMonthlyNet, `${path}.averageMonthlyNet`),
    possibleSettlement: parseMoneyValue(value.possibleSettlement, `${path}.possibleSettlement`),
  };
}

function parseHouseholdPeriod(input: unknown, path: string): HouseholdPeriodReport {
  const value = record(input, path);
  return {
    precision: parsePrecision(value.precision, `${path}.precision`),
    toetsingsinkomen: parseMoneyValue(value.toetsingsinkomen, `${path}.toetsingsinkomen`),
    zorgtoeslagAnnual: parseMoneyValue(value.zorgtoeslagAnnual, `${path}.zorgtoeslagAnnual`),
    huurtoeslagAnnual: parseMoneyValue(value.huurtoeslagAnnual, `${path}.huurtoeslagAnnual`),
    spendableIncomeAnnual: parseMoneyValue(
      value.spendableIncomeAnnual,
      `${path}.spendableIncomeAnnual`,
    ),
  };
}

function parseHousehold(input: unknown, path: string): HouseholdReport {
  const value = record(input, path);
  return {
    firstCalendarYear:
      value.firstCalendarYear === undefined
        ? undefined
        : parseHouseholdPeriod(value.firstCalendarYear, `${path}.firstCalendarYear`),
    steadyState: parseHouseholdPeriod(value.steadyState, `${path}.steadyState`),
  };
}

function parseNonCash(input: unknown, path: string): NonCashReport {
  const value = record(input, path);
  return {
    precision: parsePrecision(value.precision, `${path}.precision`),
    pensionEmployerContribution: parseMoneyValue(
      value.pensionEmployerContribution,
      `${path}.pensionEmployerContribution`,
    ),
    paidLeaveDays: parseNumberValue(value.paidLeaveDays, `${path}.paidLeaveDays`),
    benefits: array(
      value.benefits,
      (item, itemPath = "benefit") => {
        const benefit = record(item, itemPath);
        return {
          id: string(benefit.id, `${itemPath}.id`),
          label: string(benefit.label, `${itemPath}.label`),
          value: parseMoneyValue(benefit.value, `${itemPath}.value`),
        };
      },
      `${path}.benefits`,
    ),
  };
}

function parseCompleteness(input: unknown, path = "completeness"): Completeness {
  const value = record(input, path);
  return {
    layer: enumeration(
      value.layer,
      ["normalization", "fiscal_payroll", "household", "non_cash"] as const,
      `${path}.layer`,
    ),
    precision: parsePrecision(value.precision, `${path}.precision`),
    missingInputs: parseStringArray(value.missingInputs, `${path}.missingInputs`),
    unsupportedReasons: parseStringArray(value.unsupportedReasons, `${path}.unsupportedReasons`),
  };
}

export function parseCompensationReport(input: unknown, path = "report"): CompensationReport {
  const value = record(input, path);
  if (value.schemaVersion !== "1") {
    throw new TypeError(`${path}.schemaVersion: expected schema version 1`);
  }
  return {
    schemaVersion: "1",
    engineVersion: string(value.engineVersion, `${path}.engineVersion`),
    calculatedAt: string(value.calculatedAt, `${path}.calculatedAt`),
    caseId: value.caseId === undefined ? undefined : string(value.caseId, `${path}.caseId`),
    selectedRules: parseRuleSelection(value.selectedRules, `${path}.selectedRules`),
    normalization: parseNormalization(value.normalization, `${path}.normalization`),
    fiscalPayroll: parseFiscalPayroll(value.fiscalPayroll, `${path}.fiscalPayroll`),
    household: parseHousehold(value.household, `${path}.household`),
    nonCash: parseNonCash(value.nonCash, `${path}.nonCash`),
    completeness: array(value.completeness, parseCompleteness, `${path}.completeness`),
    assumptions: array(
      value.assumptions,
      (item, itemPath = "assumption") => {
        const assumption = record(item, itemPath);
        return {
          code: string(assumption.code, `${itemPath}.code`),
          message: string(assumption.message, `${itemPath}.message`),
          affectedPaths: parseStringArray(assumption.affectedPaths, `${itemPath}.affectedPaths`),
        };
      },
      `${path}.assumptions`,
    ),
    limitations: array(
      value.limitations,
      (item, itemPath = "limitation") => {
        const limitation = record(item, itemPath);
        return {
          code: string(limitation.code, `${itemPath}.code`),
          layer: enumeration(
            limitation.layer,
            ["normalization", "fiscal_payroll", "household", "non_cash"] as const,
            `${itemPath}.layer`,
          ),
          message: string(limitation.message, `${itemPath}.message`),
          affectedOutputs: parseStringArray(
            limitation.affectedOutputs,
            `${itemPath}.affectedOutputs`,
          ),
        };
      },
      `${path}.limitations`,
    ),
    derivationTrace: array(
      value.derivationTrace,
      (item, itemPath = "derivation") => {
        const derivation = record(item, itemPath);
        return {
          id: string(derivation.id, `${itemPath}.id`),
          operation: string(derivation.operation, `${itemPath}.operation`),
          inputPaths: parseStringArray(derivation.inputPaths, `${itemPath}.inputPaths`),
          outputPath: string(derivation.outputPath, `${itemPath}.outputPath`),
          ruleId:
            derivation.ruleId === undefined
              ? undefined
              : string(derivation.ruleId, `${itemPath}.ruleId`),
          rounding:
            derivation.rounding === undefined
              ? undefined
              : string(derivation.rounding, `${itemPath}.rounding`),
        };
      },
      `${path}.derivationTrace`,
    ),
  };
}
