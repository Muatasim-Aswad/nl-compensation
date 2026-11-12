import type { Money } from "@nl-compensation/core";
import { eur } from "@nl-compensation/core";
import { HUURTOESLAG_2026, HUURTOESLAG_2026_RULE_ID } from "../rules/huurtoeslag-2026.js";
import type { Fraction } from "../support/rational.js";
import {
  CENTS_PER_EURO,
  ZERO,
  add,
  clampAtZero,
  div,
  floorToInteger,
  fromInt,
  min,
  percentageOf,
  sub,
} from "../support/rational.js";
import type { RuleOutcome } from "../support/result.js";
import { centsToMoney, supported, unsupported } from "../support/result.js";

export type HuurtoeslagBlockReason = "assets_above_limit" | "calculation_rent_not_above_base_rent";

export interface HuurtoeslagMemberIncome {
  readonly toetsingsinkomen: Money;
  /** A resident child younger than 23 at the start of the allowance year. */
  readonly isResidentChildUnderExemptionAge: boolean;
}

export interface HuurtoeslagInput {
  /** Kale huur per month; service costs no longer count from 2026. */
  readonly bareRentMonthly: Money;
  /** Applicant plus benefit partner plus co-residents. */
  readonly householdSize: number;
  readonly hasBenefitPartner: boolean;
  readonly coResidentCount: number;
  readonly everyMemberUnder21: boolean;
  readonly under21WithChildOrHandicap: boolean;
  readonly memberIncomes: readonly HuurtoeslagMemberIncome[];
  readonly combinedAssets: Money;
  /**
   * False for situations the published calculation does not cover on its own,
   * such as a woonwagen standplaats, subletting, or a mid-year change that
   * requires a manual request.
   */
  readonly ordinaryHousehold: boolean;
}

export interface HuurtoeslagResult {
  readonly calculationRent: Money;
  readonly baseRent: Money;
  readonly qualityDiscountLimit: Money;
  readonly cappingLimit?: Money;
  readonly calculationIncome: Money;
  readonly partA: Money;
  readonly partB: Money;
  readonly partC: Money;
  readonly incomeCorrection: Money;
  /** The paid monthly amount, rounded down to whole euros. */
  readonly monthlyAllowance: Money;
  readonly annualAllowance: Money;
  readonly blockedBy?: HuurtoeslagBlockReason;
}

const centsFloor = (value: Fraction): Money => centsToMoney(floorToInteger(value));

/**
 * Huurtoeslag for an ordinary 2026 household.
 *
 * Parts A, B, and C plus the income-dependent correction are carried as exact
 * fractions and rounded once, at the end, downward to whole euros. The
 * published examples round their individual parts inconsistently — part C is
 * truncated while the correction in the third example is rounded up — but every
 * published monthly result is reproduced by this single final rounding. The
 * per-part amounts reported here are truncated to cents and may therefore
 * differ from the leaflet by one cent without changing the paid amount.
 */
export function calculateHuurtoeslag(
  input: HuurtoeslagInput,
  rule = HUURTOESLAG_2026,
): RuleOutcome<HuurtoeslagResult> {
  const parts = { ruleIds: [HUURTOESLAG_2026_RULE_ID] };
  const p = rule.parameters;

  if (!input.ordinaryHousehold) {
    return unsupported(
      {
        code: "nl_huurtoeslag_exceptional_situation_not_supported",
        layer: "household",
        message:
          "This household needs the exceptional-situation route, which requires a manual request and is out of scope for this release.",
        affectedOutputs: ["household.huurtoeslagAnnual"],
      },
      parts,
    );
  }
  if (input.everyMemberUnder21 && input.under21WithChildOrHandicap) {
    return unsupported(
      {
        code: "nl_huurtoeslag_under21_with_child_or_handicap_unresolved",
        layer: "household",
        message:
          "A household in which everyone is under 21 and a child or handicap raises the rent limit is not resolved by the published calculation, so no amount is produced.",
        affectedOutputs: ["household.huurtoeslagAnnual"],
      },
      parts,
    );
  }

  const singlePerson = input.householdSize === 1;
  const youngHousehold = input.everyMemberUnder21;

  const rentLimit = youngHousehold ? p.rentLimitUnder21Cents : p.rentLimitStandardCents;
  const calculationRent = min(fromInt(input.bareRentMonthly.amountCents), fromInt(rentLimit));
  const baseRent = fromInt(singlePerson ? p.baseRentSinglePersonCents : p.baseRentMultiPersonCents);
  const qualityDiscountLimit = fromInt(p.qualityDiscountLimitCents);
  const cappingLimit = youngHousehold
    ? undefined
    : fromInt(
        input.householdSize <= 2
          ? p.cappingLimitUpToTwoPersonsCents
          : p.cappingLimitThreeOrMorePersonsCents,
      );

  let income = ZERO;
  for (const member of input.memberIncomes) {
    const amount = fromInt(member.toetsingsinkomen.amountCents);
    income = add(
      income,
      member.isResidentChildUnderExemptionAge
        ? clampAtZero(sub(amount, fromInt(p.childIncomeExemptionCents)))
        : amount,
    );
  }
  income = clampAtZero(income);
  const calculationIncome = centsFloor(income);

  const assetLimit =
    (input.hasBenefitPartner ? p.maximumAssetsWithPartnerCents : p.maximumAssetsSingleCents) +
    input.coResidentCount * p.maximumAssetsPerCoResidentCents;

  const empty = (reason: HuurtoeslagBlockReason): RuleOutcome<HuurtoeslagResult> =>
    supported(
      "exact",
      {
        calculationRent: centsFloor(calculationRent),
        baseRent: centsFloor(baseRent),
        qualityDiscountLimit: centsFloor(qualityDiscountLimit),
        cappingLimit: cappingLimit === undefined ? undefined : centsFloor(cappingLimit),
        calculationIncome,
        partA: eur(0),
        partB: eur(0),
        partC: eur(0),
        incomeCorrection: eur(0),
        monthlyAllowance: eur(0),
        annualAllowance: eur(0),
        blockedBy: reason,
      },
      parts,
    );

  if (input.combinedAssets.amountCents > assetLimit) {
    return empty("assets_above_limit");
  }

  const partA = clampAtZero(sub(min(calculationRent, qualityDiscountLimit), baseRent));
  if (partA.n === 0n) {
    return empty("calculation_rent_not_above_base_rent");
  }

  const partB =
    cappingLimit === undefined
      ? ZERO
      : percentageOf(
          clampAtZero(sub(min(calculationRent, cappingLimit), qualityDiscountLimit)),
          p.partBRatePpm,
        );
  const partC =
    cappingLimit === undefined
      ? ZERO
      : percentageOf(clampAtZero(sub(calculationRent, cappingLimit)), p.partCRatePpm);

  const referencePoint = fromInt(
    singlePerson ? p.incomeReferencePointSinglePersonCents : p.incomeReferencePointMultiPersonCents,
  );
  const taperPpm = singlePerson ? p.taperRateSinglePersonPpm : p.taperRateMultiPersonPpm;
  const correction = youngHousehold
    ? ZERO
    : div(
        percentageOf(clampAtZero(sub(income, referencePoint)), taperPpm),
        fromInt(p.taperMonthsPerYear),
      );

  const monthlyExact = clampAtZero(sub(add(add(partA, partB), partC), correction));
  const monthlyEuros = floorToInteger(div(monthlyExact, fromInt(CENTS_PER_EURO)));
  const monthlyCents = monthlyEuros * CENTS_PER_EURO;

  return supported(
    "exact",
    {
      calculationRent: centsFloor(calculationRent),
      baseRent: centsFloor(baseRent),
      qualityDiscountLimit: centsFloor(qualityDiscountLimit),
      cappingLimit: cappingLimit === undefined ? undefined : centsFloor(cappingLimit),
      calculationIncome,
      partA: centsFloor(partA),
      partB: centsFloor(partB),
      partC: centsFloor(partC),
      incomeCorrection: centsFloor(correction),
      monthlyAllowance: centsToMoney(monthlyCents),
      annualAllowance: centsToMoney(monthlyCents * 12n),
    },
    {
      ...parts,
      trace: [
        {
          id: "huurtoeslag",
          operation: "parts_a_b_c_minus_income_correction",
          inputPaths: [
            "household.kaleRentMonthly",
            "household.householdMembers",
            "household.income",
          ],
          outputPath: "household.huurtoeslagAnnual",
          ruleId: HUURTOESLAG_2026_RULE_ID,
          rounding: "exact fractions throughout; monthly total rounded down to whole euros once",
        },
      ],
      assumptions: [
        {
          code: "nl_huurtoeslag_whole_year",
          message:
            "The household composition, rent, and income are assumed unchanged for the whole allowance year; the annual amount is twelve times the monthly amount.",
          affectedPaths: ["household.huurtoeslagAnnual"],
        },
      ],
    },
  );
}
