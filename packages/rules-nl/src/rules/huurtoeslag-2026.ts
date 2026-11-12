import type { Parser, RuleDefinition } from "@nl-compensation/core";
import { record } from "@nl-compensation/core";
import { SOURCE_HUURTOESLAG } from "../provenance/sources.js";
import { bool, defineRule, int } from "./define.js";

export interface HuurtoeslagRuleParameters {
  readonly rentLimitUnder21Cents: number;
  readonly rentLimitStandardCents: number;
  readonly baseRentSinglePersonCents: number;
  readonly baseRentMultiPersonCents: number;
  readonly qualityDiscountLimitCents: number;
  readonly cappingLimitUpToTwoPersonsCents: number;
  readonly cappingLimitThreeOrMorePersonsCents: number;
  readonly partBRatePpm: number;
  readonly partCRatePpm: number;
  readonly incomeReferencePointSinglePersonCents: number;
  readonly incomeReferencePointMultiPersonCents: number;
  readonly taperRateSinglePersonPpm: number;
  readonly taperRateMultiPersonPpm: number;
  readonly taperMonthsPerYear: number;
  readonly childIncomeExemptionCents: number;
  readonly childIncomeExemptionMaxAgeExclusive: number;
  readonly maximumAssetsSingleCents: number;
  readonly maximumAssetsWithPartnerCents: number;
  readonly maximumAssetsPerCoResidentCents: number;
  readonly serviceCostsCountTowardCalculationRent: boolean;
}

const parseParameters: Parser<HuurtoeslagRuleParameters> = (input, path = "parameters") => {
  const value = record(input, path);
  return {
    rentLimitUnder21Cents: int(value, "rentLimitUnder21Cents", path),
    rentLimitStandardCents: int(value, "rentLimitStandardCents", path),
    baseRentSinglePersonCents: int(value, "baseRentSinglePersonCents", path),
    baseRentMultiPersonCents: int(value, "baseRentMultiPersonCents", path),
    qualityDiscountLimitCents: int(value, "qualityDiscountLimitCents", path),
    cappingLimitUpToTwoPersonsCents: int(value, "cappingLimitUpToTwoPersonsCents", path),
    cappingLimitThreeOrMorePersonsCents: int(value, "cappingLimitThreeOrMorePersonsCents", path),
    partBRatePpm: int(value, "partBRatePpm", path),
    partCRatePpm: int(value, "partCRatePpm", path),
    incomeReferencePointSinglePersonCents: int(
      value,
      "incomeReferencePointSinglePersonCents",
      path,
    ),
    incomeReferencePointMultiPersonCents: int(value, "incomeReferencePointMultiPersonCents", path),
    taperRateSinglePersonPpm: int(value, "taperRateSinglePersonPpm", path),
    taperRateMultiPersonPpm: int(value, "taperRateMultiPersonPpm", path),
    taperMonthsPerYear: int(value, "taperMonthsPerYear", path),
    childIncomeExemptionCents: int(value, "childIncomeExemptionCents", path),
    childIncomeExemptionMaxAgeExclusive: int(value, "childIncomeExemptionMaxAgeExclusive", path),
    maximumAssetsSingleCents: int(value, "maximumAssetsSingleCents", path),
    maximumAssetsWithPartnerCents: int(value, "maximumAssetsWithPartnerCents", path),
    maximumAssetsPerCoResidentCents: int(value, "maximumAssetsPerCoResidentCents", path),
    serviceCostsCountTowardCalculationRent: bool(
      value,
      "serviceCostsCountTowardCalculationRent",
      path,
    ),
  };
};

export const HUURTOESLAG_2026_RULE_ID = "nl-huurtoeslag-2026-r2";

/**
 * Huurtoeslag 2026.
 *
 * From 2026 the basishuur no longer depends on income: it is € 202,52 for a
 * one-person household and € 200,71 for two or more. Instead the allowance is
 * reduced by an income-dependent correction above an inkomensijkpunt of
 * € 23.425 (one person, 27%) or € 31.500 (two or more, 22%), divided by twelve.
 *
 * Rekenhuur is the kale huur capped at the huurgrens, € 498,20 below 21 without
 * a child or handicap and € 932,93 otherwise. Service costs no longer count.
 * Parts A, B, and C reimburse 100%, 65%, and 40% of successive rent slices at
 * the kwaliteitskortingsgrens of € 498,20 and the aftoppingsgrens of € 713,02
 * (one or two persons) or € 764,14 (three or more).
 */
export const HUURTOESLAG_2026: RuleDefinition<HuurtoeslagRuleParameters> = defineRule(
  {
    id: HUURTOESLAG_2026_RULE_ID,
    legalFrom: "2026-01-01",
    legalTo: "2026-12-31",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    publishedAt: "2026-06-01",
    verifiedAt: "2026-11-12",
    sources: [SOURCE_HUURTOESLAG],
  },
  {
    rentLimitUnder21Cents: 49_820,
    rentLimitStandardCents: 93_293,
    baseRentSinglePersonCents: 20_252,
    baseRentMultiPersonCents: 20_071,
    qualityDiscountLimitCents: 49_820,
    cappingLimitUpToTwoPersonsCents: 71_302,
    cappingLimitThreeOrMorePersonsCents: 76_414,
    partBRatePpm: 650_000,
    partCRatePpm: 400_000,
    incomeReferencePointSinglePersonCents: 2_342_500,
    incomeReferencePointMultiPersonCents: 3_150_000,
    taperRateSinglePersonPpm: 270_000,
    taperRateMultiPersonPpm: 220_000,
    taperMonthsPerYear: 12,
    childIncomeExemptionCents: 621_800,
    childIncomeExemptionMaxAgeExclusive: 23,
    maximumAssetsSingleCents: 3_847_900,
    maximumAssetsWithPartnerCents: 7_695_800,
    maximumAssetsPerCoResidentCents: 3_847_900,
    serviceCostsCountTowardCalculationRent: false,
  } satisfies HuurtoeslagRuleParameters,
  parseParameters,
);
