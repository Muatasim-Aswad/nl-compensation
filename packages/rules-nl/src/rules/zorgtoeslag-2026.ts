import type { Parser, RuleDefinition } from "@nl-compensation/core";
import { record } from "@nl-compensation/core";
import { SOURCE_ZORGTOESLAG } from "../provenance/sources.js";
import { defineRule, int } from "./define.js";

export interface ZorgtoeslagRuleParameters {
  readonly standardPremiumSingleCents: number;
  readonly standardPremiumWithPartnerCents: number;
  readonly thresholdIncomeCents: number;
  readonly normPremiumBaseRateSinglePpm: number;
  readonly normPremiumBaseRateWithPartnerPpm: number;
  readonly normPremiumExcessRatePpm: number;
  readonly maximumIncomeSingleCents: number;
  readonly maximumIncomeWithPartnerCents: number;
  readonly maximumAssetsSingleCents: number;
  readonly maximumAssetsWithPartnerCents: number;
  readonly maximumAllowanceSingleCents: number;
  readonly maximumAllowanceWithPartnerCents: number;
  readonly uninsuredPartnerSharePpm: number;
}

const parseParameters: Parser<ZorgtoeslagRuleParameters> = (input, path = "parameters") => {
  const value = record(input, path);
  return {
    standardPremiumSingleCents: int(value, "standardPremiumSingleCents", path),
    standardPremiumWithPartnerCents: int(value, "standardPremiumWithPartnerCents", path),
    thresholdIncomeCents: int(value, "thresholdIncomeCents", path),
    normPremiumBaseRateSinglePpm: int(value, "normPremiumBaseRateSinglePpm", path),
    normPremiumBaseRateWithPartnerPpm: int(value, "normPremiumBaseRateWithPartnerPpm", path),
    normPremiumExcessRatePpm: int(value, "normPremiumExcessRatePpm", path),
    maximumIncomeSingleCents: int(value, "maximumIncomeSingleCents", path),
    maximumIncomeWithPartnerCents: int(value, "maximumIncomeWithPartnerCents", path),
    maximumAssetsSingleCents: int(value, "maximumAssetsSingleCents", path),
    maximumAssetsWithPartnerCents: int(value, "maximumAssetsWithPartnerCents", path),
    maximumAllowanceSingleCents: int(value, "maximumAllowanceSingleCents", path),
    maximumAllowanceWithPartnerCents: int(value, "maximumAllowanceWithPartnerCents", path),
    uninsuredPartnerSharePpm: int(value, "uninsuredPartnerSharePpm", path),
  };
};

export const ZORGTOESLAG_2026_RULE_ID = "nl-zorgtoeslag-2026-r2";

/**
 * Zorgtoeslag 2026, for the supported case of a client living in the
 * Netherlands.
 *
 * Standaardpremie € 2.119 (€ 4.238 with a toeslagpartner). Drempelinkomen
 * € 29.736. Normpremie is 1,912% (4,289% with a partner) of the drempelinkomen
 * plus 13,73% of the excess of the joint toetsingsinkomen over it, where a
 * negative second term counts as € 0. The allowance is the standaardpremie
 * minus the normpremie, halved when the toeslagpartner is not insured under the
 * Wet op de zorgtoeslag.
 *
 * The client's own insurance premium is deliberately not a formula input.
 */
export const ZORGTOESLAG_2026: RuleDefinition<ZorgtoeslagRuleParameters> = defineRule(
  {
    id: ZORGTOESLAG_2026_RULE_ID,
    legalFrom: "2026-01-01",
    legalTo: "2026-12-31",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    publishedAt: "2026-01-01",
    verifiedAt: "2026-11-12",
    sources: [SOURCE_ZORGTOESLAG],
  },
  {
    standardPremiumSingleCents: 211_900,
    standardPremiumWithPartnerCents: 423_800,
    thresholdIncomeCents: 2_973_600,
    normPremiumBaseRateSinglePpm: 19_120,
    normPremiumBaseRateWithPartnerPpm: 42_890,
    normPremiumExcessRatePpm: 137_300,
    maximumIncomeSingleCents: 4_085_700,
    maximumIncomeWithPartnerCents: 5_114_200,
    maximumAssetsSingleCents: 14_601_100,
    maximumAssetsWithPartnerCents: 18_463_300,
    maximumAllowanceSingleCents: 155_000,
    maximumAllowanceWithPartnerCents: 296_300,
    uninsuredPartnerSharePpm: 500_000,
  } satisfies ZorgtoeslagRuleParameters,
  parseParameters,
);
