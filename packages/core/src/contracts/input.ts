import type {
  CashComponent,
  CompensationCaseInput,
  EmployerPackageInput,
  FirstYearContext,
  FiscalInputs,
  HolidayPayBasis,
  HolidayPayInclusion,
  HouseholdInputs,
  IkbComponent,
  LeaveInputs,
  NonCashBenefit,
  PayExpression,
  PensionInputs,
  Reimbursement,
  TaxableBenefit,
  WeeklyHours,
} from "../model/compensation.js";
import { PAY_PERIODS } from "../model/compensation.js";
import type { Fact } from "../model/provenance.js";
import { EVIDENCE_STATUSES, FACT_ORIGINS, VALIDATION_STATES } from "../model/provenance.js";
import type { Money, Rational, ScaledPercentage } from "../model/scalars.js";
import type { Value } from "../model/value.js";
import {
  parseMoney,
  parseMoneyValue,
  parsePercentage,
  parseRational,
  parseRationalValue,
  valueParser,
} from "./scalars.js";
import {
  array,
  boolean,
  ContractValidationError,
  enumeration,
  integer,
  optional,
  record,
  string,
  type Parser,
} from "./validation.js";

const parseString: Parser<string> = (input, path = "value") => string(input, path);
const parseBoolean: Parser<boolean> = (input, path = "value") => boolean(input, path);
const parseStringValue = valueParser(parseString, (left, right) => left.localeCompare(right));
const parseBooleanValue = valueParser(parseBoolean, (left, right) => Number(left) - Number(right));
const parsePercentageValue = valueParser(
  parsePercentage,
  (left, right) => left.partsPerMillion - right.partsPerMillion,
);

function parseFact<T>(input: unknown, parseValue: Parser<Value<T>>, path: string): Fact<T> {
  const value = record(input, path);
  const sourceValue =
    value.source === undefined ? undefined : record(value.source, `${path}.source`);
  return {
    value: parseValue(value.value, `${path}.value`),
    origin: enumeration(value.origin, FACT_ORIGINS, `${path}.origin`),
    evidenceStatus: enumeration(value.evidenceStatus, EVIDENCE_STATUSES, `${path}.evidenceStatus`),
    validationState: enumeration(
      value.validationState,
      VALIDATION_STATES,
      `${path}.validationState`,
    ),
    source:
      sourceValue === undefined
        ? undefined
        : {
            id: string(sourceValue.id, `${path}.source.id`),
            label: optional(sourceValue.label, parseString, `${path}.source.label`),
            uri: optional(sourceValue.uri, parseString, `${path}.source.uri`),
          },
    observedAt: optional(value.observedAt, parseString, `${path}.observedAt`),
    locked: boolean(value.locked, `${path}.locked`),
  };
}

const moneyFact = (input: unknown, path = "moneyFact"): Fact<Money> =>
  parseFact(input, parseMoneyValue, path);
const rationalFact = (input: unknown, path = "rationalFact"): Fact<Rational> =>
  parseFact(input, parseRationalValue, path);
const percentageFact = (input: unknown, path = "percentageFact"): Fact<ScaledPercentage> =>
  parseFact(input, parsePercentageValue, path);
const booleanFact = (input: unknown, path = "booleanFact"): Fact<boolean> =>
  parseFact(input, parseBooleanValue, path);
const stringFact = (input: unknown, path = "stringFact"): Fact<string> =>
  parseFact(input, parseStringValue, path);

const parseWeeklyHours: Parser<WeeklyHours> = (input, path = "weeklyHours") => {
  const value = record(input, path);
  const kind = enumeration(value.kind, ["standard", "custom"] as const, `${path}.kind`);
  if (kind === "standard") {
    const hours = integer(value.hours, `${path}.hours`);
    if (hours !== 36 && hours !== 38 && hours !== 40) {
      throw new ContractValidationError([
        { path: `${path}.hours`, code: "enum", message: "expected 36, 38, or 40" },
      ]);
    }
    return { kind, hours };
  }
  return { kind, hours: parseRational(value.hours, `${path}.hours`) };
};

const weeklyHoursFact = (input: unknown, path = "weeklyHoursFact"): Fact<WeeklyHours> =>
  parseFact(input, valueParser(parseWeeklyHours, compareWeeklyHours), path);

function compareWeeklyHours(left: WeeklyHours, right: WeeklyHours): number {
  const leftValue =
    left.kind === "standard" ? left.hours : left.hours.numerator / left.hours.denominator;
  const rightValue =
    right.kind === "standard" ? right.hours : right.hours.numerator / right.hours.denominator;
  return leftValue - rightValue;
}

const parsePayExpression: Parser<PayExpression> = (input, path = "payExpression") => {
  const value = record(input, path);
  const period = enumeration(value.period, PAY_PERIODS, `${path}.period`);
  const weeklyHours = optional(value.weeklyHours, weeklyHoursFact, `${path}.weeklyHours`);
  if (period === "hourly" && weeklyHours === undefined) {
    throw new ContractValidationError([
      {
        path: `${path}.weeklyHours`,
        code: "incompatible_unit",
        message: "hourly pay requires a weekly-hours basis",
      },
    ]);
  }
  return { amount: moneyFact(value.amount, `${path}.amount`), period, weeklyHours };
};

const parseHolidayPayBasis: Parser<HolidayPayBasis> = (input, path = "holidayPayBasis") => {
  const value = record(input, path);
  const kind = enumeration(
    value.kind,
    ["base_salary", "component_ids", "unknown"] as const,
    `${path}.kind`,
  );
  if (kind === "component_ids") {
    return {
      kind,
      componentIds: array(value.componentIds, parseString, `${path}.componentIds`),
    };
  }
  return { kind };
};

const holidayInclusionValue = valueParser<HolidayPayInclusion>(
  (input, path = "holidayPayInclusion") =>
    enumeration(input, ["included", "excluded", "unknown"] as const, path),
  (left, right) => left.localeCompare(right),
);
const holidayBasisValue = valueParser(parseHolidayPayBasis, (left, right) =>
  JSON.stringify(left).localeCompare(JSON.stringify(right)),
);

const parseCashComponent: Parser<CashComponent> = (input, path = "cashComponent") => {
  const value = record(input, path);
  return {
    id: string(value.id, `${path}.id`),
    label: string(value.label, `${path}.label`),
    category: enumeration(value.category, ["guaranteed", "variable"] as const, `${path}.category`),
    amount: parsePayExpression(value.amount, `${path}.amount`),
    probability: optional(value.probability, percentageFact, `${path}.probability`),
    includedInQuotedPay: booleanFact(value.includedInQuotedPay, `${path}.includedInQuotedPay`),
  };
};

const parseIkbComponent: Parser<IkbComponent> = (input, path = "ikbComponent") => {
  const value = record(input, path);
  const amount = optional(value.amount, moneyFact, `${path}.amount`);
  const rate = optional(value.rate, percentageFact, `${path}.rate`);
  if (amount === undefined && rate === undefined) {
    throw new ContractValidationError([
      { path, code: "missing", message: "IKB component requires amount or rate" },
    ]);
  }
  return {
    id: string(value.id, `${path}.id`),
    kind: enumeration(
      value.kind,
      ["holiday_allowance", "year_end_payment", "other"] as const,
      `${path}.kind`,
    ),
    amount,
    rate,
    includedInQuotedPay: booleanFact(value.includedInQuotedPay, `${path}.includedInQuotedPay`),
    guaranteed: booleanFact(value.guaranteed, `${path}.guaranteed`),
  };
};

const parsePension: Parser<PensionInputs> = (input, path = "pension") => {
  const value = record(input, path);
  return {
    employeeContribution: optional(
      value.employeeContribution,
      moneyFact,
      `${path}.employeeContribution`,
    ),
    employerContribution: optional(
      value.employerContribution,
      moneyFact,
      `${path}.employerContribution`,
    ),
    contributionPeriod: optional(
      value.contributionPeriod,
      (item, itemPath = "contributionPeriod") => enumeration(item, PAY_PERIODS, itemPath),
      `${path}.contributionPeriod`,
    ),
    pensionableSalary: optional(value.pensionableSalary, moneyFact, `${path}.pensionableSalary`),
    premiumSplit: optional(value.premiumSplit, percentageFact, `${path}.premiumSplit`),
    accrualValue: optional(value.accrualValue, moneyFact, `${path}.accrualValue`),
  };
};

const parseLeave: Parser<LeaveInputs> = (input, path = "leave") => {
  const value = record(input, path);
  return {
    paidDaysPerYear: optional(value.paidDaysPerYear, rationalFact, `${path}.paidDaysPerYear`),
    statutoryDaysPerYear: optional(
      value.statutoryDaysPerYear,
      rationalFact,
      `${path}.statutoryDaysPerYear`,
    ),
    purchasedDaysPerYear: optional(
      value.purchasedDaysPerYear,
      rationalFact,
      `${path}.purchasedDaysPerYear`,
    ),
  };
};

const parseReimbursement: Parser<Reimbursement> = (input, path = "reimbursement") => {
  const value = record(input, path);
  return {
    id: string(value.id, `${path}.id`),
    label: string(value.label, `${path}.label`),
    amount: parsePayExpression(value.amount, `${path}.amount`),
    taxable: booleanFact(value.taxable, `${path}.taxable`),
  };
};

const parseTaxableBenefit: Parser<TaxableBenefit> = (input, path = "taxableBenefit") => {
  const value = record(input, path);
  if (value.cashPaidToEmployee !== false) {
    throw new ContractValidationError([
      {
        path: `${path}.cashPaidToEmployee`,
        code: "incompatible_category",
        message: "taxable benefits in this collection must be non-cash",
      },
    ]);
  }
  return {
    id: string(value.id, `${path}.id`),
    label: string(value.label, `${path}.label`),
    taxableValue: parsePayExpression(value.taxableValue, `${path}.taxableValue`),
    cashPaidToEmployee: false,
  };
};

const parseNonCashBenefit: Parser<NonCashBenefit> = (input, path = "nonCashBenefit") => {
  const value = record(input, path);
  return {
    id: string(value.id, `${path}.id`),
    label: string(value.label, `${path}.label`),
    kind: enumeration(
      value.kind,
      ["pension", "leave", "insurance", "equipment", "equity", "other"] as const,
      `${path}.kind`,
    ),
    employerCost: optional(value.employerCost, moneyFact, `${path}.employerCost`),
    employeeValue: optional(value.employeeValue, moneyFact, `${path}.employeeValue`),
  };
};

function parseEmployerPackage(input: unknown, path: string): EmployerPackageInput {
  const value = record(input, path);
  const holidayPay = record(value.holidayPay, `${path}.holidayPay`);
  return {
    salaryExpressions: array(
      value.salaryExpressions,
      parsePayExpression,
      `${path}.salaryExpressions`,
    ),
    actualWeeklyHours: weeklyHoursFact(value.actualWeeklyHours, `${path}.actualWeeklyHours`),
    employerFullTimeWeeklyHours: weeklyHoursFact(
      value.employerFullTimeWeeklyHours,
      `${path}.employerFullTimeWeeklyHours`,
    ),
    holidayPay: {
      inclusion: parseFact(
        holidayPay.inclusion,
        holidayInclusionValue,
        `${path}.holidayPay.inclusion`,
      ),
      rate: percentageFact(holidayPay.rate, `${path}.holidayPay.rate`),
      basis: parseFact(holidayPay.basis, holidayBasisValue, `${path}.holidayPay.basis`),
    },
    ikbComponents: array(value.ikbComponents, parseIkbComponent, `${path}.ikbComponents`),
    cashComponents: array(value.cashComponents, parseCashComponent, `${path}.cashComponents`),
    pension: optional(value.pension, parsePension, `${path}.pension`),
    leave: optional(value.leave, parseLeave, `${path}.leave`),
    reimbursements: array(value.reimbursements, parseReimbursement, `${path}.reimbursements`),
    taxableBenefits: array(value.taxableBenefits, parseTaxableBenefit, `${path}.taxableBenefits`),
    nonCashBenefits: array(value.nonCashBenefits, parseNonCashBenefit, `${path}.nonCashBenefits`),
  };
}

function parseFiscal(input: unknown, path: string): FiscalInputs {
  const value = record(input, path);
  return {
    preTaxEmployeePensionAnnual: optional(
      value.preTaxEmployeePensionAnnual,
      moneyFact,
      `${path}.preTaxEmployeePensionAnnual`,
    ),
    otherAnnualIncome: optional(value.otherAnnualIncome, moneyFact, `${path}.otherAnnualIncome`),
    taxableBenefitAnnual: optional(
      value.taxableBenefitAnnual,
      moneyFact,
      `${path}.taxableBenefitAnnual`,
    ),
    payrollTaxCreditApplied: optional(
      value.payrollTaxCreditApplied,
      booleanFact,
      `${path}.payrollTaxCreditApplied`,
    ),
    additionalWithholdingAnnual: optional(
      value.additionalWithholdingAnnual,
      moneyFact,
      `${path}.additionalWithholdingAnnual`,
    ),
    postTaxEmployeeDeductionsPerPeriod: optional(
      value.postTaxEmployeeDeductionsPerPeriod,
      moneyFact,
      `${path}.postTaxEmployeeDeductionsPerPeriod`,
    ),
    netReimbursementsPerPeriod: optional(
      value.netReimbursementsPerPeriod,
      moneyFact,
      `${path}.netReimbursementsPerPeriod`,
    ),
    underAowAge: booleanFact(value.underAowAge, `${path}.underAowAge`),
    domesticTaxpayer: booleanFact(value.domesticTaxpayer, `${path}.domesticTaxpayer`),
  };
}

function parseHousehold(input: unknown, path: string): HouseholdInputs {
  const value = record(input, path);
  return {
    hasBenefitPartner: booleanFact(value.hasBenefitPartner, `${path}.hasBenefitPartner`),
    partnerAnnualIncome: optional(
      value.partnerAnnualIncome,
      moneyFact,
      `${path}.partnerAnnualIncome`,
    ),
    applicantInsuredForDutchHealthcare: booleanFact(
      value.applicantInsuredForDutchHealthcare,
      `${path}.applicantInsuredForDutchHealthcare`,
    ),
    partnerInsuredForDutchHealthcare: optional(
      value.partnerInsuredForDutchHealthcare,
      booleanFact,
      `${path}.partnerInsuredForDutchHealthcare`,
    ),
    applicantAssets: optional(value.applicantAssets, moneyFact, `${path}.applicantAssets`),
    partnerAssets: optional(value.partnerAssets, moneyFact, `${path}.partnerAssets`),
    householdMembers: rationalFact(value.householdMembers, `${path}.householdMembers`),
    children: rationalFact(value.children, `${path}.children`),
    applicantAge: rationalFact(value.applicantAge, `${path}.applicantAge`),
    partnerAge: optional(value.partnerAge, rationalFact, `${path}.partnerAge`),
    kaleRentMonthly: optional(value.kaleRentMonthly, moneyFact, `${path}.kaleRentMonthly`),
    householdAnnualIncome: optional(
      value.householdAnnualIncome,
      moneyFact,
      `${path}.householdAnnualIncome`,
    ),
  };
}

function parseFirstYear(input: unknown, path = "firstYear"): FirstYearContext {
  const value = record(input, path);
  return {
    calendarYear: integer(value.calendarYear, `${path}.calendarYear`),
    jobStartDate: stringFact(value.jobStartDate, `${path}.jobStartDate`),
    incomeBeforeStart: optional(value.incomeBeforeStart, moneyFact, `${path}.incomeBeforeStart`),
    priorEmployerWithholding: optional(
      value.priorEmployerWithholding,
      moneyFact,
      `${path}.priorEmployerWithholding`,
    ),
    firstPaymentDate: optional(value.firstPaymentDate, stringFact, `${path}.firstPaymentDate`),
    regularPaymentDay: optional(value.regularPaymentDay, rationalFact, `${path}.regularPaymentDay`),
    holidayPaymentMonth: optional(
      value.holidayPaymentMonth,
      rationalFact,
      `${path}.holidayPaymentMonth`,
    ),
    bonusPaymentDates:
      value.bonusPaymentDates === undefined
        ? undefined
        : array(value.bonusPaymentDates, stringFact, `${path}.bonusPaymentDates`),
  };
}

export function parseCompensationCase(input: unknown, path = "case"): CompensationCaseInput {
  const value = record(input, path);
  if (value.schemaVersion !== "1") {
    throw new ContractValidationError([
      { path: `${path}.schemaVersion`, code: "version", message: "expected schema version 1" },
    ]);
  }
  return {
    schemaVersion: "1",
    caseId: optional(value.caseId, parseString, `${path}.caseId`),
    employerPackage: parseEmployerPackage(value.employerPackage, `${path}.employerPackage`),
    fiscal: parseFiscal(value.fiscal, `${path}.fiscal`),
    household: parseHousehold(value.household, `${path}.household`),
    firstYear: optional(value.firstYear, parseFirstYear, `${path}.firstYear`),
  };
}

export function compensationCaseJsonRoundTrip(input: CompensationCaseInput): CompensationCaseInput {
  return parseCompensationCase(JSON.parse(JSON.stringify(input)) as unknown);
}

export { parseMoney };
