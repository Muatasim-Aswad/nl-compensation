import {
  eur,
  exact,
  normalizeEmployerPackage,
  type CompensationCaseInput,
  type CompensationReport,
  type Money,
  type Precision,
  type Value,
} from "@nl-compensation/core";
import {
  BUNDLE_2026,
  averageMonthlyNet,
  calculateAnnualIncomeTax,
  calculateSpecialRemunerationWithholding,
  estimateRegularPeriodWithholding,
  resolveAnnualIncomeContext,
  settlementEstimate,
} from "@nl-compensation/rules-nl";
import { addOutcomeMetadata } from "./metadata.js";
import { exactBoolean, exactFact, exactMoney, noMoney } from "./values.js";

export type FiscalCalculation = {
  report: CompensationReport["fiscalPayroll"];
  completeness: CompensationReport["completeness"][number];
  annualNet?: Money;
  taxableIncome?: Money;
};

export function fiscalReportExact(
  input: CompensationCaseInput,
  gac: Money | undefined,
  metadata: {
    assumptions: CompensationReport["assumptions"][number][];
    limitations: CompensationReport["limitations"][number][];
    trace: CompensationReport["derivationTrace"][number][];
  },
): FiscalCalculation {
  const missing = new Set<string>();
  const pension = exactFact(input.fiscal.preTaxEmployeePensionAnnual);
  const otherIncome = exactFact(input.fiscal.otherAnnualIncome);
  const taxableBenefits = exactFact(input.fiscal.taxableBenefitAnnual);
  const underAow = exactBoolean(input.fiscal.underAowAge);
  const domestic = exactBoolean(input.fiscal.domesticTaxpayer);
  const applyCredits = exactFact(input.fiscal.payrollTaxCreditApplied);
  if (gac === undefined) missing.add("normalization.guaranteedAnnualCash");
  if (underAow === undefined) missing.add("fiscal.underAowAge");
  if (domestic === undefined) missing.add("fiscal.domesticTaxpayer");
  if (applyCredits === undefined) missing.add("fiscal.payrollTaxCreditApplied");

  const context =
    gac === undefined
      ? undefined
      : resolveAnnualIncomeContext({
          view: "steady_state",
          calendarYear: BUNDLE_2026.calendarYear,
          newJobCashInCalendarYear: gac,
          newJobCashFullYear: gac,
          preTaxEmployeePension: pension,
          otherAnnualIncome: otherIncome,
          taxableBenefits,
        });
  if (context !== undefined) addOutcomeMetadata(metadata, context);

  const tax =
    context?.value !== undefined &&
    underAow !== undefined &&
    domestic !== undefined &&
    applyCredits !== undefined
      ? calculateAnnualIncomeTax({
          taxableIncomeBox1: context.value.taxableIncomeBox1,
          employmentIncome: context.value.employmentIncome,
          underAowAge: underAow,
          domesticTaxpayer: domestic,
          applyTaxCredits: applyCredits,
        })
      : undefined;
  if (tax !== undefined) addOutcomeMetadata(metadata, tax);

  const normalization = normalizeEmployerPackage(input.employerPackage);
  const base = exactMoney(
    normalization.report.guaranteedBreakdown.find((item) => item.componentId === "base_salary")
      ?.annualAmount ?? noMoney(),
  );
  const specialPayment =
    gac !== undefined && base !== undefined
      ? eur(Math.max(0, gac.amountCents - base.amountCents))
      : undefined;
  const special =
    specialPayment !== undefined &&
    gac !== undefined &&
    underAow !== undefined &&
    domestic !== undefined &&
    applyCredits !== undefined
      ? calculateSpecialRemunerationWithholding({
          annualWage: gac,
          payment: specialPayment,
          payrollTaxCreditApplied: applyCredits,
          underAowAge: underAow,
          residentOfNetherlands: domestic,
        })
      : undefined;
  if (special !== undefined) addOutcomeMetadata(metadata, special);

  const specialComponents = normalization.report.guaranteedBreakdown.filter(
    (item) => item.componentId !== "base_salary",
  );
  const specialComponentOutcomes = specialComponents.map((item) => {
    const gross = exactMoney(item.annualAmount);
    const outcome =
      gross !== undefined &&
      gac !== undefined &&
      underAow !== undefined &&
      domestic !== undefined &&
      applyCredits !== undefined
        ? calculateSpecialRemunerationWithholding({
            annualWage: gac,
            payment: gross,
            payrollTaxCreditApplied: applyCredits,
            underAowAge: underAow,
            residentOfNetherlands: domestic,
          })
        : undefined;
    return { item, gross, outcome };
  });

  // The separately paid special remuneration is withheld from its own table, so
  // the regular payslip estimate must cover the rest of the year's pay only.
  // Spreading the whole annual tax over the pay periods and then adding the
  // special-payment withholding on top counted that payment's tax twice and
  // reported a refund equal to the special withholding in every case.
  const separatelyPaidCents = special?.value === undefined ? 0 : (specialPayment?.amountCents ?? 0);
  const firstPeriod = input.employerPackage.salaryExpressions[0]?.period;
  const periods = firstPeriod === "four_weekly" ? 13 : 12;
  const regular =
    context?.value !== undefined &&
    underAow !== undefined &&
    domestic !== undefined &&
    applyCredits !== undefined
      ? estimateRegularPeriodWithholding({
          periodWage: eur(
            Math.floor(
              Math.max(0, context.value.taxableIncomeBox1.amountCents - separatelyPaidCents) /
                periods,
            ),
          ),
          underAowAge: underAow,
          residentOfNetherlands: domestic,
          payrollTaxCreditApplied: applyCredits,
          periodsPerYear: periods,
        })
      : undefined;
  if (regular !== undefined) addOutcomeMetadata(metadata, regular);
  if (regular?.value !== undefined) {
    metadata.assumptions.push({
      code: "nl_payroll_even_period_wage",
      message:
        "The regular period wage evenly spreads recurring taxable wage and pre-tax deductions across the selected 12 monthly or 13 four-week periods; separately paid holiday and year-end cash use the special-remuneration table.",
      affectedPaths: ["fiscalPayroll.payrollWithholdingRegular"],
    });
  }

  const taxMoney = tax?.value?.netTax;
  const deductions = pension ?? eur(0);
  const additional = exactFact(input.fiscal.additionalWithholdingAnnual) ?? eur(0);
  const postTaxPerPeriod = exactFact(input.fiscal.postTaxEmployeeDeductionsPerPeriod);
  const netReimbursementsPerPeriod = exactFact(input.fiscal.netReimbursementsPerPeriod);
  if (postTaxPerPeriod === undefined) missing.add("fiscal.postTaxEmployeeDeductionsPerPeriod");
  if (netReimbursementsPerPeriod === undefined) missing.add("fiscal.netReimbursementsPerPeriod");
  const postTaxAnnual =
    postTaxPerPeriod === undefined ? undefined : eur(postTaxPerPeriod.amountCents * periods);
  const annualNet =
    gac !== undefined && taxMoney !== undefined && postTaxAnnual !== undefined
      ? eur(
          gac.amountCents -
            deductions.amountCents -
            taxMoney.amountCents -
            postTaxAnnual.amountCents,
        )
      : undefined;
  const totalWithheld =
    regular?.value !== undefined && special?.value !== undefined
      ? eur(
          regular.value.annualWithholding.amountCents +
            special.value.withholding.amountCents +
            additional.amountCents,
        )
      : undefined;
  const settlement =
    totalWithheld !== undefined && taxMoney !== undefined
      ? settlementEstimate(totalWithheld, taxMoney)
      : undefined;
  const normalPeriodGross =
    base === undefined ? undefined : eur(Math.round(base.amountCents / periods));
  const normalPeriodPreTaxDeduction = eur(Math.round(deductions.amountCents / periods));
  const normalPeriodAdditionalWithholding = eur(Math.round(additional.amountCents / periods));
  const normalPeriodNetSalary =
    normalPeriodGross !== undefined &&
    regular?.value !== undefined &&
    postTaxPerPeriod !== undefined
      ? eur(
          normalPeriodGross.amountCents -
            normalPeriodPreTaxDeduction.amountCents -
            regular.value.periodWithholding.amountCents -
            normalPeriodAdditionalWithholding.amountCents -
            postTaxPerPeriod.amountCents,
        )
      : undefined;
  const normalPeriodNetToBank =
    normalPeriodNetSalary === undefined || netReimbursementsPerPeriod === undefined
      ? undefined
      : eur(normalPeriodNetSalary.amountCents + netReimbursementsPerPeriod.amountCents);
  const annualNetThroughPayroll =
    gac !== undefined && totalWithheld !== undefined && postTaxAnnual !== undefined
      ? eur(
          gac.amountCents -
            deductions.amountCents -
            totalWithheld.amountCents -
            postTaxAnnual.amountCents,
        )
      : undefined;
  const specialPayments = specialComponentOutcomes.map(({ item, gross, outcome }) => {
    const withholding = outcome?.value?.withholding;
    const netPayment =
      gross === undefined || withholding === undefined
        ? undefined
        : eur(gross.amountCents - withholding.amountCents);
    const periodNetToBank =
      normalPeriodNetToBank === undefined || netPayment === undefined
        ? undefined
        : eur(normalPeriodNetToBank.amountCents + netPayment.amountCents);
    return {
      componentId: item.componentId,
      label: item.label,
      gross: gross === undefined ? noMoney() : exact(gross),
      withholding: withholding === undefined ? noMoney() : exact(withholding),
      netPayment: netPayment === undefined ? noMoney() : exact(netPayment),
      estimatedPeriodNetToBank: periodNetToBank === undefined ? noMoney() : exact(periodNetToBank),
    };
  });
  const precision: Precision =
    tax?.precision === "unsupported"
      ? "unsupported"
      : annualNet === undefined
        ? "unavailable"
        : "estimated";

  return {
    report: {
      precision,
      regularPayPeriod: firstPeriod === "four_weekly" ? "four_weekly" : "monthly",
      fiscalWageAnnual: context?.value ? exact(context.value.taxableIncomeBox1) : noMoney(),
      employeeDeductionsAnnual: pension === undefined ? noMoney() : exact(pension),
      finalIncomeTaxAnnual: taxMoney === undefined ? noMoney() : exact(taxMoney),
      payrollWithholdingRegular:
        regular?.value === undefined ? noMoney() : exact(regular.value.periodWithholding),
      specialPaymentWithholding:
        special?.value === undefined ? noMoney() : exact(special.value.withholding),
      normalPeriodGross: normalPeriodGross === undefined ? noMoney() : exact(normalPeriodGross),
      normalPeriodPreTaxDeduction: exact(normalPeriodPreTaxDeduction),
      normalPeriodAdditionalWithholding: exact(normalPeriodAdditionalWithholding),
      normalPeriodPostTaxDeduction:
        postTaxPerPeriod === undefined ? noMoney() : exact(postTaxPerPeriod),
      normalPeriodNetSalary:
        normalPeriodNetSalary === undefined ? noMoney() : exact(normalPeriodNetSalary),
      normalPeriodNetToBank:
        normalPeriodNetToBank === undefined ? noMoney() : exact(normalPeriodNetToBank),
      specialPayments,
      annualNetThroughPayroll:
        annualNetThroughPayroll === undefined ? noMoney() : exact(annualNetThroughPayroll),
      annualNetAfterSettlement: annualNet === undefined ? noMoney() : exact(annualNet),
      averageMonthlyNet: annualNet === undefined ? noMoney() : exact(averageMonthlyNet(annualNet)),
      possibleSettlement: settlement === undefined ? noMoney() : exact(settlement),
    },
    completeness: {
      layer: "fiscal_payroll",
      precision,
      missingInputs: [...missing, ...(context?.missingInputs ?? [])].sort(),
      unsupportedReasons: [...(context?.limitations ?? []), ...(tax?.limitations ?? [])].map(
        (item) => item.code,
      ),
    },
    annualNet,
    taxableIncome: context?.value?.taxableIncomeBox1,
  };
}

export function endpointMoneyValue(
  lower: Value<Money>,
  upper: Value<Money>,
  correlationId: string,
): Value<Money> {
  const lowerMoney = exactMoney(lower);
  const upperMoney = exactMoney(upper);
  if (lowerMoney === undefined || upperMoney === undefined) return noMoney();
  const minimum = Math.min(lowerMoney.amountCents, upperMoney.amountCents);
  const maximum = Math.max(lowerMoney.amountCents, upperMoney.amountCents);
  return minimum === maximum
    ? exact(eur(minimum))
    : {
        kind: "range",
        min: eur(minimum),
        max: eur(maximum),
        correlationId,
      };
}

export function mergePrecision(lower: Precision, upper: Precision): Precision {
  if (lower === "unsupported" || upper === "unsupported") return "unsupported";
  if (lower === "unavailable" || upper === "unavailable") return "unavailable";
  return "estimated";
}

export function mergeFiscalReports(
  lower: CompensationReport["fiscalPayroll"],
  upper: CompensationReport["fiscalPayroll"],
  correlationId: string,
): CompensationReport["fiscalPayroll"] {
  const bounded = (left: Value<Money>, right: Value<Money>, field: string) =>
    endpointMoneyValue(left, right, `${correlationId}:${field}`);
  const upperPayments = new Map(upper.specialPayments.map((item) => [item.componentId, item]));
  return {
    precision: mergePrecision(lower.precision, upper.precision),
    regularPayPeriod: lower.regularPayPeriod,
    fiscalWageAnnual: bounded(lower.fiscalWageAnnual, upper.fiscalWageAnnual, "fiscal-wage"),
    employeeDeductionsAnnual: bounded(
      lower.employeeDeductionsAnnual,
      upper.employeeDeductionsAnnual,
      "employee-deductions",
    ),
    finalIncomeTaxAnnual: bounded(
      lower.finalIncomeTaxAnnual,
      upper.finalIncomeTaxAnnual,
      "final-income-tax",
    ),
    payrollWithholdingRegular: bounded(
      lower.payrollWithholdingRegular,
      upper.payrollWithholdingRegular,
      "regular-withholding",
    ),
    specialPaymentWithholding: bounded(
      lower.specialPaymentWithholding,
      upper.specialPaymentWithholding,
      "special-withholding",
    ),
    normalPeriodGross: bounded(lower.normalPeriodGross, upper.normalPeriodGross, "normal-gross"),
    normalPeriodPreTaxDeduction: bounded(
      lower.normalPeriodPreTaxDeduction,
      upper.normalPeriodPreTaxDeduction,
      "normal-pre-tax-deduction",
    ),
    normalPeriodAdditionalWithholding: bounded(
      lower.normalPeriodAdditionalWithholding,
      upper.normalPeriodAdditionalWithholding,
      "normal-additional-withholding",
    ),
    normalPeriodPostTaxDeduction: bounded(
      lower.normalPeriodPostTaxDeduction,
      upper.normalPeriodPostTaxDeduction,
      "normal-post-tax-deduction",
    ),
    normalPeriodNetSalary: bounded(
      lower.normalPeriodNetSalary,
      upper.normalPeriodNetSalary,
      "normal-net-salary",
    ),
    normalPeriodNetToBank: bounded(
      lower.normalPeriodNetToBank,
      upper.normalPeriodNetToBank,
      "normal-bank-deposit",
    ),
    specialPayments: lower.specialPayments.map((left) => {
      const right = upperPayments.get(left.componentId);
      if (right === undefined) return left;
      return {
        componentId: left.componentId,
        label: left.label,
        gross: bounded(left.gross, right.gross, `${left.componentId}-gross`),
        withholding: bounded(
          left.withholding,
          right.withholding,
          `${left.componentId}-withholding`,
        ),
        netPayment: bounded(left.netPayment, right.netPayment, `${left.componentId}-net`),
        estimatedPeriodNetToBank: bounded(
          left.estimatedPeriodNetToBank,
          right.estimatedPeriodNetToBank,
          `${left.componentId}-bank-deposit`,
        ),
      };
    }),
    annualNetThroughPayroll: bounded(
      lower.annualNetThroughPayroll,
      upper.annualNetThroughPayroll,
      "annual-net-through-payroll",
    ),
    annualNetAfterSettlement: bounded(
      lower.annualNetAfterSettlement,
      upper.annualNetAfterSettlement,
      "annual-net-after-settlement",
    ),
    averageMonthlyNet: bounded(
      lower.averageMonthlyNet,
      upper.averageMonthlyNet,
      "average-monthly-net",
    ),
    possibleSettlement: bounded(
      lower.possibleSettlement,
      upper.possibleSettlement,
      "possible-settlement",
    ),
  };
}

export function fiscalReport(
  input: CompensationCaseInput,
  gac: Value<Money>,
  metadata: {
    assumptions: CompensationReport["assumptions"][number][];
    limitations: CompensationReport["limitations"][number][];
    trace: CompensationReport["derivationTrace"][number][];
  },
): FiscalCalculation {
  return fiscalReportExact(input, exactMoney(gac), metadata);
}
