import {
  eur,
  normalizeEmployerPackage,
  parseCompensationCase,
  rational,
  type CompensationCaseInput,
  type EvidenceStatus,
  type Fact,
  type FactOrigin,
  type Money,
  type PayPeriod,
  type Rational,
  type ScaledPercentage,
  type UnknownReason,
  type ValidationState,
  type Value,
  type WeeklyHours,
} from "@nl-compensation/core";

export type DraftValueMode = "exact" | "range" | "unknown";

export interface DraftMeta {
  readonly origin: FactOrigin;
  readonly evidenceStatus: EvidenceStatus;
  readonly validationState: ValidationState;
  readonly locked: boolean;
}

export interface NumberFactDraft extends DraftMeta {
  readonly mode: DraftValueMode;
  readonly exact: number;
  readonly min: number;
  readonly max: number;
  /** Optional dependency identity for a derived range. */
  readonly correlationId?: string;
  readonly unknownReason: UnknownReason;
}

export interface ChoiceFactDraft<T extends string | boolean> extends DraftMeta {
  readonly mode: "exact" | "unknown";
  readonly exact: T;
  readonly unknownReason: UnknownReason;
}

export interface SalaryDraft {
  readonly id: string;
  readonly amount: NumberFactDraft;
  readonly period: PayPeriod;
}

export interface IkbDraft {
  readonly id: string;
  readonly kind: "holiday_allowance" | "year_end_payment" | "other";
  readonly rate: NumberFactDraft;
  readonly includedInQuotedPay: ChoiceFactDraft<boolean>;
  readonly guaranteed: ChoiceFactDraft<boolean>;
}

export interface CashDraft {
  readonly id: string;
  readonly label: string;
  readonly category: "guaranteed" | "variable";
  readonly amount: NumberFactDraft;
  readonly period: PayPeriod;
  readonly probability: NumberFactDraft;
  readonly includedInQuotedPay: ChoiceFactDraft<boolean>;
}

export interface ReimbursementDraft {
  readonly id: string;
  readonly label: string;
  readonly amount: NumberFactDraft;
  readonly period: PayPeriod;
  readonly taxable: ChoiceFactDraft<boolean>;
}

export interface BenefitDraft {
  readonly id: string;
  readonly label: string;
  readonly kind: "pension" | "leave" | "insurance" | "equipment" | "equity" | "other";
  readonly value: NumberFactDraft;
}

export interface ScenarioDraft {
  readonly caseId: string;
  readonly salaries: readonly SalaryDraft[];
  readonly actualHours: NumberFactDraft;
  readonly fullTimeHours: NumberFactDraft;
  readonly holidayInclusion: ChoiceFactDraft<"included" | "excluded" | "unknown">;
  readonly holidayRate: NumberFactDraft;
  readonly holidayBasis: ChoiceFactDraft<"base_salary" | "unknown">;
  readonly thirteenthMonth: {
    readonly offered: ChoiceFactDraft<boolean>;
    readonly amountMode: "one_base_month" | "custom";
    readonly amount: NumberFactDraft;
    readonly includedInQuotedPay: ChoiceFactDraft<boolean>;
  };
  readonly ikb: readonly IkbDraft[];
  readonly cash: readonly CashDraft[];
  readonly pension: {
    readonly employeeMonthly: NumberFactDraft;
    readonly employerMonthly: NumberFactDraft;
    readonly pensionableSalaryAnnual: NumberFactDraft;
    readonly premiumSplit: NumberFactDraft;
    readonly accrualValueAnnual: NumberFactDraft;
  };
  readonly leave: {
    readonly paid: NumberFactDraft;
    readonly statutory: NumberFactDraft;
    readonly purchased: NumberFactDraft;
  };
  readonly travelReimbursement: NumberFactDraft;
  readonly educationBudget: NumberFactDraft;
  readonly reimbursements: readonly ReimbursementDraft[];
  readonly taxableBenefits: readonly BenefitDraft[];
  readonly nonCashBenefits: readonly BenefitDraft[];
  readonly fiscal: {
    readonly pensionDeductionAnnual: NumberFactDraft;
    readonly taxableBenefitsAnnual: NumberFactDraft;
    readonly payrollTaxCredit: ChoiceFactDraft<boolean>;
    readonly additionalWithholdingAnnual: NumberFactDraft;
    readonly postTaxDeductionsPerPeriod: NumberFactDraft;
    readonly underAowAge: ChoiceFactDraft<boolean>;
    readonly domesticTaxpayer: ChoiceFactDraft<boolean>;
  };
  readonly household: {
    readonly hasPartner: ChoiceFactDraft<boolean>;
    readonly partnerIncomeAnnual: NumberFactDraft;
    readonly applicantInsured: ChoiceFactDraft<boolean>;
    readonly partnerInsured: ChoiceFactDraft<boolean>;
    readonly applicantAssets: NumberFactDraft;
    readonly partnerAssets: NumberFactDraft;
    readonly members: NumberFactDraft;
    readonly children: NumberFactDraft;
    readonly applicantAge: NumberFactDraft;
    readonly partnerAge: NumberFactDraft;
    readonly kaleRentMonthly: NumberFactDraft;
    readonly householdIncomeAnnual: NumberFactDraft;
  };
  readonly firstYear: {
    readonly enabled: boolean;
    readonly calendarYear: number;
    readonly startDate: ChoiceFactDraft<string>;
    readonly incomeBeforeStart: NumberFactDraft;
    readonly priorWithholding: NumberFactDraft;
    readonly firstPaymentDate: ChoiceFactDraft<string>;
    readonly regularPaymentDay: NumberFactDraft;
    readonly holidayPaymentMonth: NumberFactDraft;
  };
}

export type ScenarioRangeSelection = "minimum" | "maximum" | "average";

function resolveDraftRanges(value: unknown, selection: ScenarioRangeSelection): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveDraftRanges(item, selection));
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (
    record.mode === "range" &&
    typeof record.min === "number" &&
    typeof record.max === "number" &&
    typeof record.exact === "number"
  ) {
    const exact =
      selection === "minimum"
        ? record.min
        : selection === "maximum"
          ? record.max
          : (record.min + record.max) / 2;
    return { ...record, mode: "exact", exact };
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, resolveDraftRanges(item, selection)]),
  );
}

/**
 * Select one exact scenario from every entered numeric range. The source draft
 * is never mutated; Average resolves input midpoints before any normalization.
 */
export function scenarioAtRangeSelection(
  draft: ScenarioDraft,
  selection: ScenarioRangeSelection,
): ScenarioDraft {
  return resolveDraftRanges(draft, selection) as ScenarioDraft;
}

const meta = (locked = false): DraftMeta => ({
  origin: "user",
  evidenceStatus: "explicit",
  validationState: "valid",
  locked,
});

export const numberFact = (
  exactValue: number,
  options: { readonly locked?: boolean; readonly unknown?: boolean } = {},
): NumberFactDraft => ({
  mode: options.unknown ? "unknown" : "exact",
  exact: exactValue,
  min: exactValue,
  max: exactValue,
  unknownReason: "not_provided",
  ...meta(options.locked),
});

export const choiceFact = <T extends string | boolean>(
  exactValue: T,
  locked = false,
): ChoiceFactDraft<T> => ({
  mode: "exact",
  exact: exactValue,
  unknownReason: "not_provided",
  ...meta(locked),
});

const unknownNumber = () => numberFact(0, { unknown: true });

export const initialScenario: ScenarioDraft = {
  caseId: "synthetic-comparison",
  salaries: [{ id: "salary-1", amount: numberFact(4_600, { locked: true }), period: "monthly" }],
  actualHours: numberFact(40, { locked: true }),
  fullTimeHours: numberFact(40),
  holidayInclusion: choiceFact("excluded"),
  holidayRate: numberFact(8),
  holidayBasis: choiceFact("base_salary"),
  thirteenthMonth: {
    offered: choiceFact(false),
    amountMode: "one_base_month",
    amount: unknownNumber(),
    includedInQuotedPay: choiceFact(false),
  },
  ikb: [],
  cash: [],
  pension: {
    employeeMonthly: unknownNumber(),
    employerMonthly: unknownNumber(),
    pensionableSalaryAnnual: unknownNumber(),
    premiumSplit: unknownNumber(),
    accrualValueAnnual: unknownNumber(),
  },
  leave: {
    paid: numberFact(25),
    statutory: unknownNumber(),
    purchased: unknownNumber(),
  },
  travelReimbursement: unknownNumber(),
  educationBudget: unknownNumber(),
  reimbursements: [],
  taxableBenefits: [],
  nonCashBenefits: [],
  fiscal: {
    pensionDeductionAnnual: unknownNumber(),
    taxableBenefitsAnnual: unknownNumber(),
    payrollTaxCredit: choiceFact(true),
    additionalWithholdingAnnual: numberFact(0),
    postTaxDeductionsPerPeriod: numberFact(0),
    underAowAge: choiceFact(true),
    domesticTaxpayer: choiceFact(true),
  },
  household: {
    hasPartner: choiceFact(false),
    partnerIncomeAnnual: unknownNumber(),
    applicantInsured: choiceFact(true),
    partnerInsured: choiceFact(false),
    applicantAssets: unknownNumber(),
    partnerAssets: unknownNumber(),
    members: numberFact(1),
    children: numberFact(0),
    applicantAge: numberFact(30),
    partnerAge: unknownNumber(),
    kaleRentMonthly: unknownNumber(),
    householdIncomeAnnual: unknownNumber(),
  },
  firstYear: {
    enabled: false,
    calendarYear: 2026,
    startDate: choiceFact("2026-01-01"),
    incomeBeforeStart: unknownNumber(),
    priorWithholding: unknownNumber(),
    firstPaymentDate: choiceFact(""),
    regularPaymentDay: unknownNumber(),
    holidayPaymentMonth: unknownNumber(),
  },
};

type MutableRecord = Record<string | number, unknown>;
export type DraftPath = readonly (string | number)[];

export type ScenarioAction =
  | {
      readonly type: "patch";
      readonly path: DraftPath;
      readonly patch: Readonly<Record<string, unknown>>;
    }
  | { readonly type: "add-salary" }
  | { readonly type: "remove-salary"; readonly index: number }
  | { readonly type: "add-ikb" }
  | { readonly type: "add-cash"; readonly category: "guaranteed" | "variable" }
  | { readonly type: "add-reimbursement" }
  | {
      readonly type: "add-benefit";
      readonly taxable: boolean;
    }
  | {
      readonly type: "remove-item";
      readonly collection:
        | "ikb"
        | "cash"
        | "reimbursements"
        | "taxableBenefits"
        | "nonCashBenefits";
      readonly index: number;
    };

function patchAtPath<T>(root: T, path: DraftPath, patch: Readonly<Record<string, unknown>>): T {
  const copy = structuredClone(root);
  let cursor = copy as MutableRecord;
  for (const segment of path) {
    cursor = cursor[segment] as MutableRecord;
  }
  Object.assign(cursor, patch);
  return copy;
}

export function scenarioReducer(state: ScenarioDraft, action: ScenarioAction): ScenarioDraft {
  if (action.type === "patch") return patchAtPath(state, action.path, action.patch);
  if (action.type === "remove-salary") {
    return { ...state, salaries: state.salaries.filter((_, index) => index !== action.index) };
  }
  if (action.type === "remove-item") {
    return {
      ...state,
      [action.collection]: state[action.collection].filter((_, index) => index !== action.index),
    };
  }
  const suffix = String(Date.now());
  if (action.type === "add-salary") {
    return {
      ...state,
      salaries: [
        ...state.salaries,
        { id: `salary-${suffix}`, amount: unknownNumber(), period: "annual" },
      ],
    };
  }
  if (action.type === "add-ikb") {
    return {
      ...state,
      ikb: [
        ...state.ikb,
        {
          id: `ikb-${suffix}`,
          kind: "year_end_payment",
          rate: numberFact(8.3),
          includedInQuotedPay: choiceFact(false),
          guaranteed: choiceFact(true),
        },
      ],
    };
  }
  if (action.type === "add-cash") {
    return {
      ...state,
      cash: [
        ...state.cash,
        {
          id: `cash-${suffix}`,
          label: action.category === "guaranteed" ? "Year-end payment" : "Target bonus",
          category: action.category,
          amount: unknownNumber(),
          period: "annual",
          probability: numberFact(action.category === "variable" ? 50 : 100),
          includedInQuotedPay: choiceFact(false),
        },
      ],
    };
  }
  if (action.type === "add-reimbursement") {
    return {
      ...state,
      reimbursements: [
        ...state.reimbursements,
        {
          id: `reimbursement-${suffix}`,
          label: "Travel reimbursement",
          amount: unknownNumber(),
          period: "monthly",
          taxable: choiceFact(false),
        },
      ],
    };
  }
  return {
    ...state,
    [action.taxable ? "taxableBenefits" : "nonCashBenefits"]: [
      ...(action.taxable ? state.taxableBenefits : state.nonCashBenefits),
      {
        id: `benefit-${suffix}`,
        label: action.taxable ? "Taxable benefit" : "Equipment",
        kind: action.taxable ? "other" : "equipment",
        value: unknownNumber(),
      },
    ],
  };
}

function numberValue<T>(
  draft: NumberFactDraft,
  convert: (value: number) => T,
  correlationId: string,
): Value<T> {
  if (draft.mode === "unknown") return { kind: "unknown", reason: draft.unknownReason };
  if (draft.mode === "range") {
    return {
      kind: "range",
      min: convert(draft.min),
      max: convert(draft.max),
      correlationId: draft.correlationId ?? correlationId,
    };
  }
  return { kind: "exact", value: convert(draft.exact) };
}

function numberToRational(value: number): Rational {
  const text = String(value);
  const decimals = text.includes(".") ? (text.split(".")[1]?.length ?? 0) : 0;
  const denominator = 10 ** decimals;
  return rational(Math.round(value * denominator), denominator);
}

function fact<T>(draft: DraftMeta, value: Value<T>): Fact<T> {
  return {
    value,
    origin: draft.origin,
    evidenceStatus: draft.evidenceStatus,
    validationState: draft.validationState,
    locked: draft.locked,
    source: { id: "web-form", label: "Open form" },
  };
}

function moneyFact(draft: NumberFactDraft, path: string): Fact<Money> {
  return fact(
    draft,
    numberValue(draft, (value) => eur(Math.round(value * 100)), path),
  );
}

function rationalFact(draft: NumberFactDraft, path: string): Fact<Rational> {
  return fact(draft, numberValue(draft, numberToRational, path));
}

function percentageFact(draft: NumberFactDraft, path: string): Fact<ScaledPercentage> {
  return fact(
    draft,
    numberValue(draft, (value) => ({ partsPerMillion: Math.round(value * 10_000) }), path),
  );
}

function choiceToFact<T extends string | boolean>(draft: ChoiceFactDraft<T>): Fact<T> {
  return fact(
    draft,
    draft.mode === "unknown"
      ? { kind: "unknown", reason: draft.unknownReason }
      : { kind: "exact", value: draft.exact },
  );
}

function weeklyHoursFact(draft: NumberFactDraft, path: string): Fact<WeeklyHours> {
  const convert = (hours: number): WeeklyHours =>
    hours === 36 || hours === 38 || hours === 40
      ? { kind: "standard", hours }
      : { kind: "custom", hours: numberToRational(hours) };
  return fact(draft, numberValue(draft, convert, path));
}

function optionalMoney(draft: NumberFactDraft, path: string): Fact<Money> | undefined {
  return draft.mode === "unknown" && draft.unknownReason === "not_applicable"
    ? undefined
    : moneyFact(draft, path);
}

function optionalRational(draft: NumberFactDraft, path: string): Fact<Rational> | undefined {
  return draft.mode === "unknown" && draft.unknownReason === "not_applicable"
    ? undefined
    : rationalFact(draft, path);
}

function supportedScopeZeroMoney(id: string): Fact<Money> {
  return {
    value: { kind: "exact", value: eur(0) },
    origin: "derived",
    evidenceStatus: "explicit",
    validationState: "valid",
    locked: true,
    source: { id, label: "Supported calculator scope" },
  };
}

function buildCompensationCase(
  draft: ScenarioDraft,
  thirteenthMonthAmount: NumberFactDraft,
): CompensationCaseInput {
  const reimbursementPeriod =
    draft.salaries[0]?.period === "four_weekly" ? "four_weekly" : "monthly";
  const input: CompensationCaseInput = {
    schemaVersion: "1",
    caseId: draft.caseId || undefined,
    employerPackage: {
      salaryExpressions: draft.salaries.map((salary, index) => ({
        amount: moneyFact(salary.amount, `salary-${index}`),
        period: salary.period,
        weeklyHours:
          salary.period === "hourly"
            ? weeklyHoursFact(draft.actualHours, `salary-${index}-hours`)
            : undefined,
      })),
      actualWeeklyHours: weeklyHoursFact(draft.actualHours, "actual-hours"),
      employerFullTimeWeeklyHours: weeklyHoursFact(draft.fullTimeHours, "full-time-hours"),
      holidayPay: {
        inclusion: choiceToFact(draft.holidayInclusion),
        rate: percentageFact(draft.holidayRate, "holiday-rate"),
        basis: fact(
          draft.holidayBasis,
          draft.holidayBasis.mode === "unknown"
            ? { kind: "unknown", reason: draft.holidayBasis.unknownReason }
            : {
                kind: "exact",
                value:
                  draft.holidayBasis.exact === "base_salary"
                    ? { kind: "base_salary" }
                    : { kind: "unknown" },
              },
        ),
      },
      ikbComponents: draft.ikb.map((component, index) => ({
        id: component.id,
        kind: component.kind,
        rate: percentageFact(component.rate, `ikb-${index}`),
        includedInQuotedPay: choiceToFact(component.includedInQuotedPay),
        guaranteed: choiceToFact(component.guaranteed),
      })),
      cashComponents: [
        ...(draft.thirteenthMonth.offered.mode !== "exact" || draft.thirteenthMonth.offered.exact
          ? [
              {
                id: "thirteenth-month",
                label: "Guaranteed 13th month",
                category: "guaranteed" as const,
                amount: {
                  amount:
                    draft.thirteenthMonth.offered.mode === "exact"
                      ? moneyFact(thirteenthMonthAmount, "thirteenth-month")
                      : fact<Money>(draft.thirteenthMonth.offered, {
                          kind: "unknown",
                          reason: "not_known",
                        }),
                  period: "annual" as const,
                },
                includedInQuotedPay: choiceToFact(draft.thirteenthMonth.includedInQuotedPay),
              },
            ]
          : []),
        ...draft.cash.map((component, index) => ({
          id: component.id,
          label: component.label,
          category: component.category,
          amount: {
            amount: moneyFact(component.amount, `cash-${index}`),
            period: component.period,
          },
          probability:
            component.category === "variable"
              ? percentageFact(component.probability, `cash-${index}-probability`)
              : undefined,
          includedInQuotedPay: choiceToFact(component.includedInQuotedPay),
        })),
      ],
      pension: {
        employeeContribution: optionalMoney(draft.pension.employeeMonthly, "pension-employee"),
        employerContribution: optionalMoney(draft.pension.employerMonthly, "pension-employer"),
        contributionPeriod: "monthly",
        pensionableSalary: optionalMoney(
          draft.pension.pensionableSalaryAnnual,
          "pensionable-salary",
        ),
        premiumSplit:
          draft.pension.premiumSplit.mode === "unknown"
            ? undefined
            : percentageFact(draft.pension.premiumSplit, "pension-split"),
        accrualValue: optionalMoney(draft.pension.accrualValueAnnual, "pension-accrual"),
      },
      leave: {
        paidDaysPerYear: optionalRational(draft.leave.paid, "leave-paid"),
        statutoryDaysPerYear: optionalRational(draft.leave.statutory, "leave-statutory"),
        purchasedDaysPerYear: optionalRational(draft.leave.purchased, "leave-purchased"),
      },
      reimbursements: [
        {
          id: "travel-reimbursement",
          label: "Recurring travel reimbursement",
          amount: {
            amount: moneyFact(draft.travelReimbursement, "travel-reimbursement"),
            period: reimbursementPeriod,
          },
          taxable: fact(draft.travelReimbursement, { kind: "exact", value: false }),
        },
        ...draft.reimbursements.map((item, index) => ({
          id: item.id,
          label: item.label,
          amount: { amount: moneyFact(item.amount, `reimbursement-${index}`), period: item.period },
          taxable: choiceToFact(item.taxable),
        })),
      ],
      taxableBenefits: draft.taxableBenefits.map((item, index) => ({
        id: item.id,
        label: item.label,
        taxableValue: {
          amount: moneyFact(item.value, `taxable-benefit-${index}`),
          period: "annual",
        },
        cashPaidToEmployee: false,
      })),
      nonCashBenefits: [
        {
          id: "education-budget",
          label: "Education budget",
          kind: "other",
          employeeValue: optionalMoney(draft.educationBudget, "education-budget"),
        },
        ...draft.nonCashBenefits.map((item, index) => ({
          id: item.id,
          label: item.label,
          kind: item.kind,
          employeeValue: optionalMoney(item.value, `non-cash-${index}`),
        })),
      ],
    },
    fiscal: {
      preTaxEmployeePensionAnnual: optionalMoney(
        draft.fiscal.pensionDeductionAnnual,
        "fiscal-pension",
      ),
      otherAnnualIncome: supportedScopeZeroMoney("other-annual-income-fixed-zero"),
      taxableBenefitAnnual: optionalMoney(draft.fiscal.taxableBenefitsAnnual, "taxable-benefits"),
      payrollTaxCreditApplied: choiceToFact(draft.fiscal.payrollTaxCredit),
      additionalWithholdingAnnual: optionalMoney(
        draft.fiscal.additionalWithholdingAnnual,
        "additional-withholding",
      ),
      postTaxEmployeeDeductionsPerPeriod: optionalMoney(
        draft.fiscal.postTaxDeductionsPerPeriod,
        "post-tax-deductions-per-period",
      ),
      netReimbursementsPerPeriod: optionalMoney(draft.travelReimbursement, "travel-reimbursement"),
      underAowAge: choiceToFact(draft.fiscal.underAowAge),
      domesticTaxpayer: choiceToFact(draft.fiscal.domesticTaxpayer),
    },
    household: {
      hasBenefitPartner: choiceToFact(draft.household.hasPartner),
      partnerAnnualIncome: optionalMoney(draft.household.partnerIncomeAnnual, "partner-income"),
      applicantInsuredForDutchHealthcare: choiceToFact(draft.household.applicantInsured),
      partnerInsuredForDutchHealthcare: choiceToFact(draft.household.partnerInsured),
      applicantAssets: optionalMoney(draft.household.applicantAssets, "applicant-assets"),
      partnerAssets: optionalMoney(draft.household.partnerAssets, "partner-assets"),
      householdMembers: rationalFact(draft.household.members, "household-members"),
      children: rationalFact(draft.household.children, "children"),
      applicantAge: rationalFact(draft.household.applicantAge, "applicant-age"),
      partnerAge: optionalRational(draft.household.partnerAge, "partner-age"),
      kaleRentMonthly: optionalMoney(draft.household.kaleRentMonthly, "kale-rent"),
      householdAnnualIncome: optionalMoney(
        draft.household.householdIncomeAnnual,
        "household-income",
      ),
    },
    firstYear: draft.firstYear.enabled
      ? {
          calendarYear: draft.firstYear.calendarYear,
          jobStartDate: choiceToFact(draft.firstYear.startDate),
          incomeBeforeStart: optionalMoney(
            draft.firstYear.incomeBeforeStart,
            "income-before-start",
          ),
          priorEmployerWithholding: optionalMoney(
            draft.firstYear.priorWithholding,
            "prior-withholding",
          ),
          firstPaymentDate:
            draft.firstYear.firstPaymentDate.mode === "exact" &&
            draft.firstYear.firstPaymentDate.exact === ""
              ? undefined
              : choiceToFact(draft.firstYear.firstPaymentDate),
          regularPaymentDay: optionalRational(
            draft.firstYear.regularPaymentDay,
            "regular-payment-day",
          ),
          holidayPaymentMonth: optionalRational(
            draft.firstYear.holidayPaymentMonth,
            "holiday-payment-month",
          ),
        }
      : undefined,
  };
  return parseCompensationCase(input);
}

const derivedAmountMeta: DraftMeta = {
  origin: "derived",
  evidenceStatus: "inferred",
  validationState: "valid",
  locked: true,
};

function oneTwelfthOfAnnualBase(value: Value<Money>): NumberFactDraft {
  if (value.kind === "unknown") {
    return {
      ...numberFact(0, { unknown: true }),
      ...derivedAmountMeta,
      unknownReason: value.reason,
    };
  }
  if (value.kind === "range") {
    return {
      ...numberFact(0),
      ...derivedAmountMeta,
      mode: "range",
      min: Math.round(value.min.amountCents / 12) / 100,
      max: Math.round(value.max.amountCents / 12) / 100,
      correlationId: value.correlationId,
    };
  }
  const exact = Math.round(value.value.amountCents / 12) / 100;
  return { ...numberFact(exact), ...derivedAmountMeta };
}

function sameNumberValue(left: NumberFactDraft, right: NumberFactDraft): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === "unknown") return left.unknownReason === right.unknownReason;
  if (left.mode === "range") {
    return (
      left.min === right.min && left.max === right.max && left.correlationId === right.correlationId
    );
  }
  return left.exact === right.exact;
}

/**
 * Derive a true 13th month from the normalized annual base. Iteration matters
 * when an annual quote already includes that payment: the included fixed amount
 * changes the base from which one twelfth is derived. The pure normalization
 * engine remains the sole owner of that inclusion arithmetic.
 */
export function standardThirteenthMonthAmount(draft: ScenarioDraft): NumberFactDraft {
  let candidate: NumberFactDraft = { ...numberFact(0), ...derivedAmountMeta };
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const provisional = buildCompensationCase(draft, candidate);
    const normalized = normalizeEmployerPackage(provisional.employerPackage);
    const base =
      normalized.report.guaranteedBreakdown.find(
        (component) => component.componentId === "base_salary",
      )?.annualAmount ?? ({ kind: "unknown", reason: "not_known" } as const);
    const next = oneTwelfthOfAnnualBase(base);
    if (sameNumberValue(candidate, next)) return next;
    candidate = next;
  }
  return candidate;
}

export function toCompensationCase(draft: ScenarioDraft): CompensationCaseInput {
  const thirteenthMonthAmount =
    draft.thirteenthMonth.amountMode === "one_base_month"
      ? standardThirteenthMonthAmount(draft)
      : draft.thirteenthMonth.amount;
  return buildCompensationCase(draft, thirteenthMonthAmount);
}
