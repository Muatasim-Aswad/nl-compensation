import type {
  CashComponent,
  EmployerPackageInput,
  HolidayPayBasis,
  IkbComponent,
  WeeklyHours,
} from "../model/compensation.js";
import type { Assumption, DerivationStep, Fact } from "../model/provenance.js";
import type { Completeness, NormalizationReport, Precision } from "../model/report.js";
import type { Money, Rational, ScaledPercentage } from "../model/scalars.js";
import { eur, rational } from "../model/scalars.js";
import type { Value } from "../model/value.js";
import { exact, range, unknown } from "../model/value.js";
import { annualizePayExpression, weeklyHoursRational } from "../normalization/pay.js";
import {
  addMoneyValues,
  divideMoneyValue,
  moneyValueBounds,
  multiplyMoneyByPercentageValue,
  multiplyMoneyValue,
  normalizeRational,
  subtractMoneyValues,
} from "../normalization/value-math.js";
import {
  solveSalaryExpressions,
  type SalaryConstraintDiagnostic,
  type SalarySolution,
} from "../solver/salary-solver.js";

export interface NormalizationDiagnostic {
  readonly code:
    | "ambiguous_component_flag"
    | "category_probability_mismatch"
    | "holiday_basis_unavailable"
    | "holiday_ikb_conflict"
    | "invalid_percentage"
    | "negative_base"
    | "range_division_unavailable";
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly paths: readonly string[];
}

export interface NormalizationOutcome {
  readonly report: NormalizationReport;
  readonly completeness: Completeness;
  readonly assumptions: readonly Assumption[];
  readonly derivationTrace: readonly DerivationStep[];
  readonly diagnostics: readonly (SalaryConstraintDiagnostic | NormalizationDiagnostic)[];
  readonly salarySolution: SalarySolution;
}

interface ComponentValue {
  readonly id: string;
  readonly label: string;
  readonly annualAmount?: Value<Money>;
  readonly rate?: Value<ScaledPercentage>;
  readonly included?: boolean;
  readonly guaranteed?: boolean;
  readonly sourcePath: string;
}

const zeroMoney = exact(eur(0));

function exactBoolean(fact: Fact<boolean>): boolean | undefined {
  return fact.value.kind === "exact" ? fact.value.value : undefined;
}

function percentageIsValid(value: Value<ScaledPercentage>): boolean {
  if (value.kind === "unknown") return true;
  const minimum = value.kind === "exact" ? value.value : value.min;
  const maximum = value.kind === "exact" ? value.value : value.max;
  return minimum.partsPerMillion >= 0 && maximum.partsPerMillion <= 1_000_000;
}

function percentageBounds(value: Value<ScaledPercentage>): readonly [number, number] | undefined {
  if (value.kind === "unknown") return undefined;
  if (value.kind === "exact") {
    return [value.value.partsPerMillion, value.value.partsPerMillion];
  }
  return [value.min.partsPerMillion, value.max.partsPerMillion];
}

function sumPercentageValues(values: readonly Value<ScaledPercentage>[]): Value<ScaledPercentage> {
  if (values.some((value) => value.kind === "unknown")) return unknown("not_known");
  let minimum = 0;
  let maximum = 0;
  const correlations: string[] = [];
  for (const value of values) {
    if (value.kind === "unknown") return value;
    if (value.kind === "exact") {
      minimum += value.value.partsPerMillion;
      maximum += value.value.partsPerMillion;
    } else {
      minimum += value.min.partsPerMillion;
      maximum += value.max.partsPerMillion;
      correlations.push(value.correlationId);
    }
  }
  if (correlations.length === 0) return exact({ partsPerMillion: minimum });
  return range(
    { partsPerMillion: minimum },
    { partsPerMillion: maximum },
    correlations.length === 1
      ? correlations[0]!
      : `percentage-sum(${[...new Set(correlations)].sort().join("+")})`,
  );
}

function percentageFactor(value: Value<ScaledPercentage>, includeOne: boolean): Value<Rational> {
  if (value.kind === "unknown") return value;
  const convert = (percentage: ScaledPercentage): Rational =>
    normalizeRational(
      rational(percentage.partsPerMillion + (includeOne ? 1_000_000 : 0), 1_000_000),
    );
  if (value.kind === "exact") return exact(convert(value.value));
  return range(convert(value.min), convert(value.max), value.correlationId);
}

function annualComponent(component: CashComponent): Value<Money> {
  return annualizePayExpression(component.amount);
}

function mapCashComponents(input: EmployerPackageInput): readonly ComponentValue[] {
  return input.cashComponents.map((component, index) => ({
    id: component.id,
    label: component.label,
    annualAmount: annualComponent(component),
    included: exactBoolean(component.includedInQuotedPay),
    guaranteed: component.category === "guaranteed",
    sourcePath: `employerPackage.cashComponents[${index}]`,
  }));
}

function mapIkbComponents(input: EmployerPackageInput): readonly ComponentValue[] {
  return input.ikbComponents
    .map((component, index): ComponentValue | undefined => {
      if (component.kind === "holiday_allowance") return undefined;
      return {
        id: component.id,
        label: component.kind === "year_end_payment" ? "Guaranteed year-end payment" : component.id,
        annualAmount: component.amount?.value,
        rate: component.amount === undefined ? component.rate?.value : undefined,
        included: exactBoolean(component.includedInQuotedPay),
        guaranteed: exactBoolean(component.guaranteed),
        sourcePath: `employerPackage.ikbComponents[${index}]`,
      };
    })
    .filter((component): component is ComponentValue => component !== undefined);
}

function componentAnnualAmount(component: ComponentValue, base: Value<Money>): Value<Money> {
  if (component.annualAmount !== undefined) return component.annualAmount;
  if (component.rate !== undefined) return multiplyMoneyByPercentageValue(base, component.rate);
  return unknown("not_provided");
}

function actualHoursValue(fact: Fact<WeeklyHours>): Value<Rational> {
  if (fact.value.kind === "unknown") return fact.value;
  if (fact.value.kind === "exact") return exact(weeklyHoursRational(fact.value.value));
  return range(
    weeklyHoursRational(fact.value.min),
    weeklyHoursRational(fact.value.max),
    fact.value.correlationId,
  );
}

function precisionFor(values: readonly Value<unknown>[]): Precision {
  if (values.some((value) => value.kind === "unknown")) return "unavailable";
  return values.some((value) => value.kind === "range") ? "estimated" : "exact";
}

function holidayBasisParts(
  basis: HolidayPayBasis,
  components: readonly ComponentValue[],
  missingInputs: Set<string>,
  diagnostics: NormalizationDiagnostic[],
): { baseCoefficient: number; fixed: Value<Money>; rateReferences: readonly ComponentValue[] } {
  if (basis.kind === "base_salary") {
    return { baseCoefficient: 1, fixed: zeroMoney, rateReferences: [] };
  }
  if (basis.kind === "unknown") {
    missingInputs.add("employerPackage.holidayPay.basis");
    diagnostics.push({
      code: "holiday_basis_unavailable",
      severity: "error",
      message: "Holiday allowance needs an explicit base-salary or component subset basis.",
      paths: ["employerPackage.holidayPay.basis"],
    });
    return { baseCoefficient: 0, fixed: unknown("not_known"), rateReferences: [] };
  }

  let baseCoefficient = 0;
  const fixed: Value<Money>[] = [];
  const rateReferences: ComponentValue[] = [];
  for (const componentId of basis.componentIds) {
    if (componentId === "base" || componentId === "base_salary") {
      baseCoefficient += 1;
      continue;
    }
    const component = components.find((candidate) => candidate.id === componentId);
    if (component === undefined) {
      const path = `employerPackage.holidayPay.basis.componentIds.${componentId}`;
      missingInputs.add(path);
      diagnostics.push({
        code: "holiday_basis_unavailable",
        severity: "error",
        message: `Holiday basis component ${componentId} does not resolve to a cash component.`,
        paths: [path],
      });
      fixed.push(unknown("not_provided"));
    } else if (component.annualAmount !== undefined) {
      fixed.push(component.annualAmount);
    } else if (component.rate !== undefined) {
      rateReferences.push(component);
    } else {
      fixed.push(unknown("not_provided"));
    }
  }
  return { baseCoefficient, fixed: addMoneyValues(fixed), rateReferences };
}

function inspectHolidayIkb(
  input: EmployerPackageInput,
  diagnostics: NormalizationDiagnostic[],
): void {
  const holidayRate = percentageBounds(input.holidayPay.rate.value);
  const inclusion =
    input.holidayPay.inclusion.value.kind === "exact"
      ? input.holidayPay.inclusion.value.value
      : undefined;
  input.ikbComponents.forEach((component: IkbComponent, index) => {
    if (component.kind !== "holiday_allowance") return;
    const paths = ["employerPackage.holidayPay", `employerPackage.ikbComponents[${index}]`];
    const ikbRate =
      component.rate === undefined ? undefined : percentageBounds(component.rate.value);
    const ikbIncluded = exactBoolean(component.includedInQuotedPay);
    const rateConflict =
      holidayRate !== undefined &&
      ikbRate !== undefined &&
      (holidayRate[0] !== ikbRate[0] || holidayRate[1] !== ikbRate[1]);
    const inclusionConflict =
      inclusion !== undefined &&
      inclusion !== "unknown" &&
      ikbIncluded !== undefined &&
      (inclusion === "included") !== ikbIncluded;
    if (rateConflict || inclusionConflict) {
      diagnostics.push({
        code: "holiday_ikb_conflict",
        severity: "error",
        message: "Holiday-pay terms conflict with the duplicate IKB holiday component.",
        paths,
      });
    }
  });
}

/** Pure employer-package calculation. It deliberately imports no fiscal rule. */
export function normalizeEmployerPackage(input: EmployerPackageInput): NormalizationOutcome {
  const missingInputs = new Set<string>();
  const diagnostics: (SalaryConstraintDiagnostic | NormalizationDiagnostic)[] = [];
  const assumptions: Assumption[] = [];
  const derivationTrace: DerivationStep[] = [];
  const salarySolution = solveSalaryExpressions(
    input.salaryExpressions,
    input.actualWeeklyHours,
    input.employerFullTimeWeeklyHours,
  );
  diagnostics.push(...salarySolution.diagnostics);

  const components = [...mapCashComponents(input), ...mapIkbComponents(input)];
  inspectHolidayIkb(input, diagnostics as NormalizationDiagnostic[]);

  for (const component of components) {
    if (component.included === undefined) {
      missingInputs.add(`${component.sourcePath}.includedInQuotedPay`);
      diagnostics.push({
        code: "ambiguous_component_flag",
        severity: "error",
        message: `${component.id} must state whether it is already included in quoted pay.`,
        paths: [`${component.sourcePath}.includedInQuotedPay`],
      });
    }
    if (component.guaranteed === undefined) {
      missingInputs.add(`${component.sourcePath}.guaranteed`);
      diagnostics.push({
        code: "ambiguous_component_flag",
        severity: "error",
        message: `${component.id} must state whether it is guaranteed or discretionary.`,
        paths: [`${component.sourcePath}.guaranteed`],
      });
    }
  }
  input.cashComponents.forEach((component, index) => {
    if (component.category === "guaranteed" && component.probability !== undefined) {
      diagnostics.push({
        code: "category_probability_mismatch",
        severity: "warning",
        message:
          "A guaranteed component does not use a probability; its category remains guaranteed.",
        paths: [`employerPackage.cashComponents[${index}].probability`],
      });
    }
  });

  const fixedIncluded = components
    .filter((component) => component.included === true && component.annualAmount !== undefined)
    .map((component) => component.annualAmount!);
  const includedRates = components
    .filter((component) => component.included === true && component.rate !== undefined)
    .map((component) => component.rate!);
  const invalidRatePaths = components
    .filter((component) => component.rate !== undefined && !percentageIsValid(component.rate))
    .map((component) => `${component.sourcePath}.rate`);
  if (!percentageIsValid(input.holidayPay.rate.value)) {
    invalidRatePaths.push("employerPackage.holidayPay.rate");
  }
  if (invalidRatePaths.length > 0) {
    diagnostics.push({
      code: "invalid_percentage",
      severity: "error",
      message: "Normalization percentages must be between 0% and 100%.",
      paths: invalidRatePaths,
    });
  }

  const holidayInclusion =
    input.holidayPay.inclusion.value.kind === "exact"
      ? input.holidayPay.inclusion.value.value
      : undefined;
  const holidayBasis =
    input.holidayPay.basis.value.kind === "exact" ? input.holidayPay.basis.value.value : undefined;
  if (holidayInclusion === undefined || holidayInclusion === "unknown") {
    missingInputs.add("employerPackage.holidayPay.inclusion");
  }
  if (holidayBasis === undefined) missingInputs.add("employerPackage.holidayPay.basis");
  if (input.holidayPay.rate.value.kind === "unknown") {
    missingInputs.add("employerPackage.holidayPay.rate");
  }

  const basisParts =
    holidayBasis === undefined
      ? { baseCoefficient: 0, fixed: unknown("not_known") as Value<Money>, rateReferences: [] }
      : holidayBasisParts(
          holidayBasis,
          components,
          missingInputs,
          diagnostics as NormalizationDiagnostic[],
        );

  let baseAnnual: Value<Money> = salarySolution.annualBase;
  const canSolveBase =
    baseAnnual.kind !== "unknown" &&
    holidayInclusion !== undefined &&
    holidayInclusion !== "unknown" &&
    holidayBasis !== undefined &&
    invalidRatePaths.length === 0 &&
    !components.some((component) => component.included === undefined);

  if (canSolveBase) {
    let numerator = subtractMoneyValues(baseAnnual, addMoneyValues(fixedIncluded));
    const rateFactors = [...includedRates];
    if (holidayInclusion === "included") {
      if (basisParts.rateReferences.length > 0) {
        diagnostics.push({
          code: "range_division_unavailable",
          severity: "error",
          message:
            "An included holiday allowance cannot use a rate-derived component in its basis.",
          paths: ["employerPackage.holidayPay.basis"],
        });
        numerator = unknown("not_known");
      } else {
        numerator = subtractMoneyValues(
          numerator,
          multiplyMoneyByPercentageValue(basisParts.fixed, input.holidayPay.rate.value),
        );
        if (basisParts.baseCoefficient === 1) rateFactors.push(input.holidayPay.rate.value);
        if (basisParts.baseCoefficient > 1) {
          const repeated = Array.from(
            { length: basisParts.baseCoefficient },
            () => input.holidayPay.rate.value,
          );
          rateFactors.push(...repeated);
        }
      }
    }
    baseAnnual = divideMoneyValue(
      numerator,
      percentageFactor(sumPercentageValues(rateFactors), true),
    );
  } else {
    baseAnnual = unknown("not_known");
  }

  const baseBounds = moneyValueBounds(baseAnnual);
  if (baseBounds !== undefined && baseBounds[0] < 0) {
    diagnostics.push({
      code: "negative_base",
      severity: "error",
      message: "Included components exceed quoted annual pay, producing a negative base salary.",
      paths: ["employerPackage.salaryExpressions", "employerPackage.cashComponents"],
    });
    baseAnnual = unknown("not_known");
  }

  let holidayBasisAmount: Value<Money>;
  if (basisParts.rateReferences.length > 0 && holidayInclusion !== "included") {
    holidayBasisAmount = addMoneyValues([
      basisParts.fixed,
      ...(basisParts.baseCoefficient > 0 ? [baseAnnual] : []),
      ...basisParts.rateReferences.map((component) => componentAnnualAmount(component, baseAnnual)),
    ]);
  } else {
    holidayBasisAmount = addMoneyValues([
      basisParts.fixed,
      ...(basisParts.baseCoefficient > 0 ? [baseAnnual] : []),
    ]);
  }
  const holidayAmount =
    holidayInclusion === undefined || holidayInclusion === "unknown"
      ? unknown("not_known")
      : multiplyMoneyByPercentageValue(holidayBasisAmount, input.holidayPay.rate.value);

  const guaranteedComponents = components.filter((component) => component.guaranteed === true);
  const guaranteedBreakdown = [
    { componentId: "base_salary", label: "Annual base salary", annualAmount: baseAnnual },
    { componentId: "holiday_allowance", label: "Holiday allowance", annualAmount: holidayAmount },
    ...guaranteedComponents.map((component) => ({
      componentId: component.id,
      label: component.label,
      annualAmount: componentAnnualAmount(component, baseAnnual),
    })),
  ];
  const guaranteedAnnualCash = addMoneyValues(
    guaranteedBreakdown.map((component) => component.annualAmount),
  );

  const variableValues: Value<Money>[] = [];
  input.cashComponents.forEach((component, index) => {
    if (component.category !== "variable") return;
    if (component.probability === undefined) {
      missingInputs.add(`employerPackage.cashComponents[${index}].probability`);
      variableValues.push(unknown("not_provided"));
      return;
    }
    if (!percentageIsValid(component.probability.value)) {
      diagnostics.push({
        code: "invalid_percentage",
        severity: "error",
        message: "Variable-cash probabilities must be between 0% and 100%.",
        paths: [`employerPackage.cashComponents[${index}].probability`],
      });
      variableValues.push(unknown("not_known"));
      return;
    }
    variableValues.push(
      multiplyMoneyByPercentageValue(annualComponent(component), component.probability.value),
    );
  });
  input.ikbComponents.forEach((component, index) => {
    if (component.kind !== "holiday_allowance" && exactBoolean(component.guaranteed) === false) {
      missingInputs.add(`employerPackage.ikbComponents[${index}].probability`);
      variableValues.push(unknown("not_provided"));
    }
  });
  const expectedVariableCash = addMoneyValues(variableValues);

  const hours = actualHoursValue(input.actualWeeklyHours);
  let guaranteedAnnualCashAt40Hours: Value<Money> = unknown("not_known");
  let nominalHourlyEquivalent: Value<Money> = unknown("not_known");
  if (hours.kind === "unknown") {
    missingInputs.add("employerPackage.actualWeeklyHours");
  } else {
    guaranteedAnnualCashAt40Hours = multiplyMoneyValue(
      divideMoneyValue(guaranteedAnnualCash, hours),
      rational(40, 1),
    );
    nominalHourlyEquivalent = divideMoneyValue(
      guaranteedAnnualCash,
      hours.kind === "exact"
        ? exact(normalizeRational(rational(hours.value.numerator * 52, hours.value.denominator)))
        : range(
            normalizeRational(rational(hours.min.numerator * 52, hours.min.denominator)),
            normalizeRational(rational(hours.max.numerator * 52, hours.max.denominator)),
            hours.correlationId,
          ),
    );
  }

  if (
    salarySolution.diagnostics.some(
      (diagnostic) => diagnostic.code === "salary_source_disagreement",
    )
  ) {
    assumptions.push({
      code: "salary_source_precedence",
      message: "The highest-precedence compatible salary source supplies the working value.",
      affectedPaths: ["employerPackage.salaryExpressions"],
    });
  }
  derivationTrace.push(
    {
      id: "normalization.annual-base",
      operation: "annualize salary expression and remove included components",
      inputPaths: [
        "employerPackage.salaryExpressions",
        "employerPackage.ikbComponents",
        "employerPackage.cashComponents",
      ],
      outputPath: "normalization.guaranteedBreakdown.base_salary",
      rounding: "half-away-from-zero to euro cents",
    },
    {
      id: "normalization.gac",
      operation: "sum base, holiday allowance, and guaranteed cash only",
      inputPaths: guaranteedBreakdown.map((component) => component.componentId),
      outputPath: "normalization.guaranteedAnnualCash",
      rounding: "component values rounded half-away-from-zero to euro cents",
    },
    {
      id: "normalization.hour-equivalents",
      operation: "scale GAC by caller-supplied actual weekly hours",
      inputPaths: ["normalization.guaranteedAnnualCash", "employerPackage.actualWeeklyHours"],
      outputPath: "normalization.guaranteedAnnualCashAt40Hours",
      rounding: "half-away-from-zero to euro cents",
    },
  );

  const reportValues: readonly Value<unknown>[] = [
    guaranteedAnnualCash,
    guaranteedAnnualCashAt40Hours,
    nominalHourlyEquivalent,
    expectedVariableCash,
    ...guaranteedBreakdown.map((component) => component.annualAmount),
  ];
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const precision = hasErrors ? "unavailable" : precisionFor(reportValues);
  const report: NormalizationReport = {
    precision,
    guaranteedAnnualCash,
    guaranteedAnnualCashAtActualHours: guaranteedAnnualCash,
    guaranteedAnnualCashAt40Hours,
    nominalHourlyEquivalent,
    guaranteedBreakdown,
    expectedVariableCash,
  };
  return {
    report,
    completeness: {
      layer: "normalization",
      precision,
      missingInputs: [...missingInputs].sort(),
      unsupportedReasons: diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => diagnostic.code),
    },
    assumptions,
    derivationTrace,
    diagnostics,
    salarySolution,
  };
}
