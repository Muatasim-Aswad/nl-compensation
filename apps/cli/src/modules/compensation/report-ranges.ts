import {
  parseCompensationReport,
  type CompensationReport,
  type Precision,
} from "@nl-compensation/core";
import { mergeFiscalReports, mergePrecision } from "./fiscal.js";
import { appendUnique } from "./metadata.js";

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function orderedEndpointValues(
  lower: unknown,
  upper: unknown,
): { readonly min: unknown; readonly max: unknown } | undefined {
  if (typeof lower === "number" && typeof upper === "number") {
    return lower <= upper ? { min: lower, max: upper } : { min: upper, max: lower };
  }
  if (typeof lower === "object" && lower !== null && typeof upper === "object" && upper !== null) {
    const left = lower as Record<string, unknown>;
    const right = upper as Record<string, unknown>;
    if (
      left.currency === "EUR" &&
      right.currency === "EUR" &&
      typeof left.amountCents === "number" &&
      typeof right.amountCents === "number"
    ) {
      return left.amountCents <= right.amountCents
        ? { min: lower, max: upper }
        : { min: upper, max: lower };
    }
    if (
      typeof left.numerator === "number" &&
      typeof left.denominator === "number" &&
      typeof right.numerator === "number" &&
      typeof right.denominator === "number"
    ) {
      const leftValue = left.numerator / left.denominator;
      const rightValue = right.numerator / right.denominator;
      return leftValue <= rightValue ? { min: lower, max: upper } : { min: upper, max: lower };
    }
  }
  return undefined;
}

export function mergeEndpointNode(lower: unknown, upper: unknown, path: string): unknown {
  if (sameJson(lower, upper)) return lower;
  if (typeof lower === "object" && lower !== null && typeof upper === "object" && upper !== null) {
    const left = lower as Record<string, unknown>;
    const right = upper as Record<string, unknown>;
    if (left.kind === "exact" && right.kind === "exact") {
      const endpoints = orderedEndpointValues(left.value, right.value);
      return endpoints === undefined
        ? { kind: "unknown", reason: "not_known" }
        : {
            kind: "range",
            min: endpoints.min,
            max: endpoints.max,
            correlationId: `scenario-endpoints:${path}`,
          };
    }
    if ("kind" in left || "kind" in right) return { kind: "unknown", reason: "not_known" };
    if (Array.isArray(lower) && Array.isArray(upper) && lower.length === upper.length) {
      return lower.map((item, index) => mergeEndpointNode(item, upper[index], `${path}[${index}]`));
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return Object.fromEntries(
      [...keys].map((key) => [
        key,
        key in left && key in right
          ? mergeEndpointNode(left[key], right[key], `${path}.${key}`)
          : (left[key] ?? right[key]),
      ]),
    );
  }
  return lower;
}

export function mergedLayerPrecision<T extends { readonly precision: Precision }>(
  lower: T,
  upper: T,
): Precision {
  return sameJson(lower, upper)
    ? lower.precision
    : mergePrecision(lower.precision, upper.precision);
}

export function mergeEndpointReports(
  lower: CompensationReport,
  upper: CompensationReport,
  inputRangePaths: readonly string[],
): CompensationReport {
  const correlationId = "scenario-endpoints";
  const normalization = mergeEndpointNode(
    lower.normalization,
    upper.normalization,
    "normalization",
  ) as CompensationReport["normalization"];
  const steadyState = mergeEndpointNode(
    lower.household.steadyState,
    upper.household.steadyState,
    "household.steadyState",
  ) as CompensationReport["household"]["steadyState"];
  const lowerFirstYear = lower.household.firstCalendarYear;
  const upperFirstYear = upper.household.firstCalendarYear;
  const firstCalendarYear =
    lowerFirstYear === undefined || upperFirstYear === undefined
      ? undefined
      : (mergeEndpointNode(
          lowerFirstYear,
          upperFirstYear,
          "household.firstCalendarYear",
        ) as NonNullable<CompensationReport["household"]["firstCalendarYear"]>);
  const nonCash = mergeEndpointNode(
    lower.nonCash,
    upper.nonCash,
    "nonCash",
  ) as CompensationReport["nonCash"];
  const normalizationPrecision = mergedLayerPrecision(lower.normalization, upper.normalization);
  const fiscalPayroll = mergeFiscalReports(lower.fiscalPayroll, upper.fiscalPayroll, correlationId);
  const steadyStatePrecision = mergedLayerPrecision(
    lower.household.steadyState,
    upper.household.steadyState,
  );
  const nonCashPrecision = mergedLayerPrecision(lower.nonCash, upper.nonCash);
  const assumptions = [...lower.assumptions];
  const limitations = [...lower.limitations];
  const derivationTrace = [...lower.derivationTrace];
  appendUnique(assumptions, upper.assumptions);
  appendUnique(limitations, upper.limitations);
  appendUnique(derivationTrace, upper.derivationTrace);
  assumptions.push({
    code: "nl_range_scenario_endpoints",
    message:
      "Both evaluates two complete exact scenarios: one with every input range at its minimum and one with every input range at its maximum.",
    affectedPaths: inputRangePaths,
  });

  const completeness = lower.completeness.map((left) => {
    const right = upper.completeness.find((item) => item.layer === left.layer) ?? left;
    const precision =
      left.layer === "normalization"
        ? normalizationPrecision
        : left.layer === "fiscal_payroll"
          ? fiscalPayroll.precision
          : left.layer === "household"
            ? steadyStatePrecision
            : nonCashPrecision;
    return {
      layer: left.layer,
      precision,
      missingInputs: [...new Set([...left.missingInputs, ...right.missingInputs])].sort(),
      unsupportedReasons: [
        ...new Set([...left.unsupportedReasons, ...right.unsupportedReasons]),
      ].sort(),
    };
  });

  return parseCompensationReport({
    ...lower,
    normalization: {
      ...normalization,
      precision: normalizationPrecision,
    },
    fiscalPayroll,
    household: {
      ...(firstCalendarYear === undefined
        ? {}
        : {
            firstCalendarYear: {
              ...firstCalendarYear,
              precision: mergedLayerPrecision(lowerFirstYear!, upperFirstYear!),
            },
          }),
      steadyState: {
        ...steadyState,
        precision: steadyStatePrecision,
      },
    },
    nonCash: {
      ...nonCash,
      precision: nonCashPrecision,
    },
    completeness,
    assumptions,
    limitations,
    derivationTrace,
  });
}
