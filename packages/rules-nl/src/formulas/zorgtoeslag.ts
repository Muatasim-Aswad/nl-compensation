import type { Money } from "@nl-compensation/core";
import { eur } from "@nl-compensation/core";
import { ZORGTOESLAG_2026, ZORGTOESLAG_2026_RULE_ID } from "../rules/zorgtoeslag-2026.js";
import {
  CENTS_PER_EURO,
  add,
  clampAtZero,
  compare,
  floorToInteger,
  fromInt,
  percentageOf,
  sub,
} from "../support/rational.js";
import type { RuleOutcome } from "../support/result.js";
import { centsToMoney, supported, unsupported } from "../support/result.js";

export type ZorgtoeslagBlockReason =
  | "applicant_not_insured"
  | "assets_above_limit"
  | "income_above_limit";

export interface ZorgtoeslagInput {
  readonly applicantToetsingsinkomen: Money;
  readonly partnerToetsingsinkomen?: Money;
  readonly hasBenefitPartner: boolean;
  readonly applicantInsuredForDutchHealthcare: boolean;
  readonly partnerInsuredForDutchHealthcare?: boolean;
  /** Joint assets on 1 January of the allowance year. */
  readonly combinedAssets: Money;
  readonly residentOfNetherlands: boolean;
}

export interface ZorgtoeslagResult {
  readonly jointToetsingsinkomen: Money;
  readonly standardPremium: Money;
  readonly normPremium: Money;
  readonly annualAllowance: Money;
  /** The paid monthly amount, rounded down to whole euros. */
  readonly monthlyAllowance: Money;
  readonly halvedForUninsuredPartner: boolean;
  readonly blockedBy?: ZorgtoeslagBlockReason;
}

/**
 * Zorgtoeslag for a client living in the Netherlands.
 *
 * The normpremie is truncated to cents: the official example that yields
 * € 1.275,37704 is published as € 1.275,37, which rules out rounding up. The
 * paid monthly amount is the annual allowance divided by twelve and rounded
 * down to whole euros, which reproduces all three published examples.
 *
 * The client's own insurance premium is never an input.
 */
export function calculateZorgtoeslag(
  input: ZorgtoeslagInput,
  rule = ZORGTOESLAG_2026,
): RuleOutcome<ZorgtoeslagResult> {
  const parts = { ruleIds: [ZORGTOESLAG_2026_RULE_ID] };
  const p = rule.parameters;

  if (!input.residentOfNetherlands) {
    return unsupported(
      {
        code: "nl_zorgtoeslag_non_resident_not_supported",
        layer: "household",
        message:
          "Only clients living in the Netherlands are supported. The woonlandfactor calculation for residents abroad is out of scope for this release.",
        affectedOutputs: ["household.zorgtoeslagAnnual"],
      },
      parts,
    );
  }

  const partnerIncome = input.hasBenefitPartner
    ? fromInt(input.partnerToetsingsinkomen?.amountCents ?? 0)
    : fromInt(0);
  const jointIncome = add(fromInt(input.applicantToetsingsinkomen.amountCents), partnerIncome);
  const jointIncomeMoney = centsToMoney(floorToInteger(jointIncome));

  const standardPremium = input.hasBenefitPartner
    ? p.standardPremiumWithPartnerCents
    : p.standardPremiumSingleCents;
  const maximumIncome = input.hasBenefitPartner
    ? p.maximumIncomeWithPartnerCents
    : p.maximumIncomeSingleCents;
  const maximumAssets = input.hasBenefitPartner
    ? p.maximumAssetsWithPartnerCents
    : p.maximumAssetsSingleCents;

  const zero = (reason: ZorgtoeslagBlockReason): RuleOutcome<ZorgtoeslagResult> =>
    supported(
      "exact",
      {
        jointToetsingsinkomen: jointIncomeMoney,
        standardPremium: eur(standardPremium),
        normPremium: eur(0),
        annualAllowance: eur(0),
        monthlyAllowance: eur(0),
        halvedForUninsuredPartner: false,
        blockedBy: reason,
      },
      parts,
    );

  if (!input.applicantInsuredForDutchHealthcare) {
    return zero("applicant_not_insured");
  }
  if (input.combinedAssets.amountCents > maximumAssets) {
    return zero("assets_above_limit");
  }
  if (compare(jointIncome, fromInt(maximumIncome)) > 0) {
    return zero("income_above_limit");
  }

  const threshold = fromInt(p.thresholdIncomeCents);
  const baseRatePpm = input.hasBenefitPartner
    ? p.normPremiumBaseRateWithPartnerPpm
    : p.normPremiumBaseRateSinglePpm;
  const excess = clampAtZero(sub(jointIncome, threshold));
  const normPremiumCents = floorToInteger(
    add(percentageOf(threshold, baseRatePpm), percentageOf(excess, p.normPremiumExcessRatePpm)),
  );

  const beforeShare = BigInt(standardPremium) - normPremiumCents;
  const positive = beforeShare > 0n ? beforeShare : 0n;
  const halve = input.hasBenefitPartner && input.partnerInsuredForDutchHealthcare === false;
  const annualCents = halve
    ? floorToInteger(percentageOf(fromInt(positive), p.uninsuredPartnerSharePpm))
    : positive;
  const monthlyEuros = floorToInteger({ n: annualCents, d: 12n * CENTS_PER_EURO });

  return supported(
    "exact",
    {
      jointToetsingsinkomen: jointIncomeMoney,
      standardPremium: eur(standardPremium),
      normPremium: centsToMoney(normPremiumCents),
      annualAllowance: centsToMoney(annualCents),
      monthlyAllowance: centsToMoney(monthlyEuros * CENTS_PER_EURO),
      halvedForUninsuredPartner: halve,
    },
    {
      ...parts,
      trace: [
        {
          id: "zorgtoeslag",
          operation: "standard_premium_minus_norm_premium",
          inputPaths: ["household.toetsingsinkomen", "household.hasBenefitPartner"],
          outputPath: "household.zorgtoeslagAnnual",
          ruleId: ZORGTOESLAG_2026_RULE_ID,
          rounding: "norm premium truncated to cents; monthly amount rounded down to whole euros",
        },
      ],
    },
  );
}
