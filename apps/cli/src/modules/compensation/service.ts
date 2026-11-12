import {
  CALCULATION_API_VERSION,
  ContractValidationError,
  eur,
  normalizeEmployerPackage,
  parseCalculationRequest,
  parseCompensationReport,
  type CalculationContext,
  type CalculationResponseEnvelope,
  type CompensationCaseInput,
  type CompensationReport,
} from "@nl-compensation/core";
import {
  BUNDLE_2026_ID,
  calculateAnnualIncomeTax,
  resolveAnnualIncomeContext,
} from "@nl-compensation/rules-nl";
import { fiscalReport } from "./fiscal.js";
import { householdPeriod, prorationForFirstYear } from "./household.js";
import { atRangeBound, rangePaths } from "./input-ranges.js";
import { addOutcomeMetadata } from "./metadata.js";
import { nonCashReport } from "./non-cash.js";
import { mergeEndpointReports } from "./report-ranges.js";
import { ENGINE_VERSION, sameRules, selectedRules } from "./rules.js";
import { exactBoolean, exactFact, exactMoney, isExplicitZeroMoney, moneyTimes } from "./values.js";

export function calculateExactCompensation(
  input: CompensationCaseInput,
  context: CalculationContext,
): CompensationReport {
  const expectedRules = selectedRules();
  if (!sameRules(context.rules, expectedRules)) {
    throw new ContractValidationError([
      {
        path: "request.context.rules",
        code: "unsupported_rules",
        message: `expected the immutable ${BUNDLE_2026_ID} rule bundle and content hashes`,
      },
    ]);
  }
  if (context.engineVersion !== ENGINE_VERSION) {
    throw new ContractValidationError([
      {
        path: "request.context.engineVersion",
        code: "unsupported_engine",
        message: `expected engine version ${ENGINE_VERSION}`,
      },
    ]);
  }
  if (!isExplicitZeroMoney(input.fiscal.otherAnnualIncome)) {
    throw new ContractValidationError([
      {
        path: "input.fiscal.otherAnnualIncome",
        code: "unsupported_other_annual_income",
        message:
          "otherAnnualIncome is fixed at EUR 0 in the supported scope; model additional employment cash as an employer cash component instead",
      },
    ]);
  }

  const normalization = normalizeEmployerPackage(input.employerPackage);
  const metadata: {
    assumptions: CompensationReport["assumptions"][number][];
    limitations: CompensationReport["limitations"][number][];
    trace: CompensationReport["derivationTrace"][number][];
  } = {
    assumptions: [...normalization.assumptions],
    limitations: [],
    trace: [...normalization.derivationTrace],
  };
  const guaranteedAnnualCash = normalization.report.guaranteedAnnualCash;
  const gac = exactMoney(guaranteedAnnualCash);
  const fiscal = fiscalReport(input, guaranteedAnnualCash, metadata);
  const household = householdPeriod(input, fiscal.taxableIncome, fiscal.annualNet, metadata);

  let firstCalendarYear: CompensationReport["household"]["firstCalendarYear"];
  const firstYearFraction =
    input.firstYear === undefined ? undefined : prorationForFirstYear(input);
  if (input.firstYear !== undefined && gac !== undefined && firstYearFraction === undefined) {
    // A start date that is not a real day inside the stated calendar year cannot
    // prorate the new job's cash. Producing a first-year view from a zero
    // fraction would silently report the year as if the job had paid nothing.
    metadata.limitations.push({
      code: "first_year_start_date_unusable",
      layer: "fiscal_payroll",
      message:
        "firstYear.jobStartDate is not a valid calendar date inside firstYear.calendarYear, so no first-calendar-year view is produced.",
      affectedOutputs: ["household.firstCalendarYear", "fiscalPayroll.possibleSettlement"],
    });
  }
  if (input.firstYear !== undefined && gac !== undefined && firstYearFraction !== undefined) {
    const fraction = firstYearFraction;
    const firstContext = resolveAnnualIncomeContext({
      view: "first_calendar_year",
      calendarYear: input.firstYear.calendarYear,
      incomeBeforeStart: exactFact(input.firstYear.incomeBeforeStart),
      withholdingBeforeStart: exactFact(input.firstYear.priorEmployerWithholding),
      newJobCashInCalendarYear: moneyTimes(gac, fraction),
      newJobCashFullYear: gac,
      preTaxEmployeePension: (() => {
        const annual = exactFact(input.fiscal.preTaxEmployeePensionAnnual);
        return annual === undefined ? undefined : moneyTimes(annual, fraction);
      })(),
      otherAnnualIncome: exactFact(input.fiscal.otherAnnualIncome),
      taxableBenefits: (() => {
        const annual = exactFact(input.fiscal.taxableBenefitAnnual);
        return annual === undefined ? undefined : moneyTimes(annual, fraction);
      })(),
    });
    addOutcomeMetadata(metadata, firstContext);
    const firstTax =
      firstContext.value === undefined
        ? undefined
        : calculateAnnualIncomeTax({
            taxableIncomeBox1: firstContext.value.taxableIncomeBox1,
            employmentIncome: firstContext.value.employmentIncome,
            underAowAge: exactBoolean(input.fiscal.underAowAge) ?? false,
            domesticTaxpayer: exactBoolean(input.fiscal.domesticTaxpayer) ?? false,
            applyTaxCredits: exactBoolean(input.fiscal.payrollTaxCreditApplied) ?? false,
          });
    if (firstTax !== undefined) addOutcomeMetadata(metadata, firstTax);
    const firstNet =
      firstContext.value !== undefined && firstTax?.value !== undefined
        ? eur(firstContext.value.employmentIncome.amountCents - firstTax.value.netTax.amountCents)
        : undefined;
    firstCalendarYear = householdPeriod(
      input,
      firstContext.value?.taxableIncomeBox1,
      firstNet,
      metadata,
      true,
    ).report;
  }

  const nonCash = nonCashReport(input);
  const report: CompensationReport = {
    schemaVersion: "1",
    engineVersion: context.engineVersion,
    calculatedAt: context.calculatedAt,
    caseId: input.caseId,
    selectedRules: context.rules,
    normalization: normalization.report,
    fiscalPayroll: fiscal.report,
    household: {
      ...(firstCalendarYear === undefined ? {} : { firstCalendarYear }),
      steadyState: household.report,
    },
    nonCash: nonCash.report,
    completeness: [
      normalization.completeness,
      fiscal.completeness,
      {
        layer: "household",
        precision: household.report.precision,
        missingInputs: household.missing,
        unsupportedReasons: household.unsupported,
      },
      nonCash.completeness,
    ],
    assumptions: metadata.assumptions,
    limitations: metadata.limitations,
    derivationTrace: metadata.trace,
  };
  return parseCompensationReport(report);
}

export function calculateCompensation(
  input: CompensationCaseInput,
  context: CalculationContext,
): CompensationReport {
  const inputRangePaths = rangePaths(input);
  if (inputRangePaths.length === 0) return calculateExactCompensation(input, context);
  const minimum = calculateExactCompensation(atRangeBound(input, "min"), context);
  const maximum = calculateExactCompensation(atRangeBound(input, "max"), context);
  return mergeEndpointReports(minimum, maximum, inputRangePaths);
}

export function calculateRequest(rawRequest: unknown): CalculationResponseEnvelope {
  let requestId = "unknown";
  try {
    const request = parseCalculationRequest(rawRequest);
    requestId = request.requestId;
    return {
      apiVersion: CALCULATION_API_VERSION,
      requestId,
      ok: true,
      report: calculateCompensation(request.input, request.context),
    };
  } catch (error) {
    if (!(error instanceof ContractValidationError)) throw error;
    const issues = error.issues;
    return {
      apiVersion: CALCULATION_API_VERSION,
      requestId,
      ok: false,
      errors: issues,
    };
  }
}

export {
  createCalculationRequest,
  DEFAULT_RULE_BUNDLE,
  ENGINE_VERSION,
  listRules,
  requestFromUnknown,
  selectedRules,
  showRule,
} from "./rules.js";
