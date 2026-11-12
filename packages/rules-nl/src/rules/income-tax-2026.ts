import type { Parser, RuleDefinition } from "@nl-compensation/core";
import { array, record } from "@nl-compensation/core";
import {
  SOURCE_INCOME_TAX_BANDS,
  SOURCE_LOONHEFFINGEN_ANNEX,
  SOURCE_PENSION_PREMIUM,
  SOURCE_TAX_CREDITS,
} from "../provenance/sources.js";
import { assertAscendingFrom, bool, defineRule, int, nullableInt } from "./define.js";

export interface TaxBand {
  readonly fromCents: number;
  /** `null` marks the open top band. */
  readonly toCents: number | null;
  readonly ratePpm: number;
}

/** credit = baseAmountCents + ratePpm% x (income - fromCents), clamped to the segment. */
export interface CreditSegment {
  readonly fromCents: number;
  readonly toCents: number | null;
  readonly baseAmountCents: number;
  readonly ratePpm: number;
}

export interface IncomeTaxRuleParameters {
  readonly box1BandsUnderAowAge: readonly TaxBand[];
  readonly generalTaxCreditSegments: readonly CreditSegment[];
  readonly labourTaxCreditSegments: readonly CreditSegment[];
  readonly employeePensionPremiumReducesFiscalWage: boolean;
  readonly aowAgeAndOlderSupported: boolean;
}

const parseBand: Parser<TaxBand> = (input, path = "band") => {
  const value = record(input, path);
  return {
    fromCents: int(value, "fromCents", path),
    toCents: nullableInt(value, "toCents", path),
    ratePpm: int(value, "ratePpm", path),
  };
};

const parseSegment: Parser<CreditSegment> = (input, path = "segment") => {
  const value = record(input, path);
  return {
    fromCents: int(value, "fromCents", path),
    toCents: nullableInt(value, "toCents", path),
    baseAmountCents: int(value, "baseAmountCents", path),
    ratePpm: int(value, "ratePpm", path),
  };
};

const parseParameters: Parser<IncomeTaxRuleParameters> = (input, path = "parameters") => {
  const value = record(input, path);
  return {
    box1BandsUnderAowAge: assertAscendingFrom(
      array(value.box1BandsUnderAowAge, parseBand, `${path}.box1BandsUnderAowAge`),
      (band) => band.fromCents,
      `${path}.box1BandsUnderAowAge`,
    ),
    generalTaxCreditSegments: assertAscendingFrom(
      array(value.generalTaxCreditSegments, parseSegment, `${path}.generalTaxCreditSegments`),
      (segment) => segment.fromCents,
      `${path}.generalTaxCreditSegments`,
    ),
    labourTaxCreditSegments: assertAscendingFrom(
      array(value.labourTaxCreditSegments, parseSegment, `${path}.labourTaxCreditSegments`),
      (segment) => segment.fromCents,
      `${path}.labourTaxCreditSegments`,
    ),
    employeePensionPremiumReducesFiscalWage: bool(
      value,
      "employeePensionPremiumReducesFiscalWage",
      path,
    ),
    aowAgeAndOlderSupported: bool(value, "aowAgeAndOlderSupported", path),
  };
};

export const INCOME_TAX_2026_RULE_ID = "nl-income-tax-2026-r2";

/**
 * Box 1 bands and tax credits for 2026, for taxpayers below the AOW age.
 *
 * Bands (loonbelasting/premie volksverzekeringen combined): up to € 38.883 at
 * 35,75%; over € 38.883 up to € 78.426 at 37,56%; over € 78.426 at 49,50%.
 * Band 1 is composed of AOW 17,90%, Anw 0,10%, Wlz 9,65%, and 8,10% tax.
 *
 * Algemene heffingskorting: € 3.115 for income up to and including € 29.736,
 * reduced by 6,398% of the excess, reaching zero at € 78.426.
 *
 * Arbeidskorting build-up: 8,324% to € 11.965 (max € 996); € 996 + 31,009% to
 * € 25.845 (max € 4.304 in that step); € 5.300 + 1,950% to € 45.592; then
 * € 5.685 reduced by 6,510%, reaching zero at € 132.920.
 *
 * Employee pension premiums withheld by the employer have already reduced the
 * fiscal wage, so they are never deducted a second time here.
 */
export const INCOME_TAX_2026: RuleDefinition<IncomeTaxRuleParameters> = defineRule(
  {
    id: INCOME_TAX_2026_RULE_ID,
    legalFrom: "2026-01-01",
    legalTo: "2026-12-31",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    publishedAt: "2026-06-25",
    verifiedAt: "2026-11-12",
    sources: [
      SOURCE_INCOME_TAX_BANDS,
      SOURCE_TAX_CREDITS,
      SOURCE_LOONHEFFINGEN_ANNEX,
      SOURCE_PENSION_PREMIUM,
    ],
  },
  {
    box1BandsUnderAowAge: [
      { fromCents: 0, toCents: 3_888_300, ratePpm: 357_500 },
      { fromCents: 3_888_300, toCents: 7_842_600, ratePpm: 375_600 },
      { fromCents: 7_842_600, toCents: null, ratePpm: 495_000 },
    ],
    generalTaxCreditSegments: [
      { fromCents: 0, toCents: 2_973_600, baseAmountCents: 311_500, ratePpm: 0 },
      { fromCents: 2_973_600, toCents: 7_842_600, baseAmountCents: 311_500, ratePpm: -63_980 },
      { fromCents: 7_842_600, toCents: null, baseAmountCents: 0, ratePpm: 0 },
    ],
    labourTaxCreditSegments: [
      { fromCents: 0, toCents: 1_196_500, baseAmountCents: 0, ratePpm: 83_240 },
      { fromCents: 1_196_500, toCents: 2_584_500, baseAmountCents: 99_600, ratePpm: 310_090 },
      { fromCents: 2_584_500, toCents: 4_559_200, baseAmountCents: 530_000, ratePpm: 19_500 },
      { fromCents: 4_559_200, toCents: 13_292_000, baseAmountCents: 568_500, ratePpm: -65_100 },
      { fromCents: 13_292_000, toCents: null, baseAmountCents: 0, ratePpm: 0 },
    ],
    employeePensionPremiumReducesFiscalWage: true,
    aowAgeAndOlderSupported: false,
  } satisfies IncomeTaxRuleParameters,
  parseParameters,
);
