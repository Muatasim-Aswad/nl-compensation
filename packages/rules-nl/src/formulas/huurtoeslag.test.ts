import { eur } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { HUURTOESLAG_2026 } from "../rules/huurtoeslag-2026.js";
import type { HuurtoeslagInput } from "./huurtoeslag.js";
import { calculateHuurtoeslag } from "./huurtoeslag.js";

const euros = (amount: number) => eur(Math.round(amount * 100));

const income = (amount: number, isChild = false) => ({
  toetsingsinkomen: euros(amount),
  isResidentChildUnderExemptionAge: isChild,
});

const base = (overrides: Partial<HuurtoeslagInput>): HuurtoeslagInput => ({
  bareRentMonthly: euros(600),
  householdSize: 1,
  hasBenefitPartner: false,
  coResidentCount: 0,
  everyMemberUnder21: false,
  under21WithChildOrHandicap: false,
  memberIncomes: [income(20_000)],
  combinedAssets: eur(0),
  ordinaryHousehold: true,
  ...overrides,
});

describe("official rekenvoorbeelden from Berekening huurtoeslag 2026", () => {
  test("example 1: single person of 20, rent € 600, income € 22.000", () => {
    const result = calculateHuurtoeslag(
      base({
        bareRentMonthly: euros(600),
        householdSize: 1,
        everyMemberUnder21: true,
        memberIncomes: [income(22_000)],
      }),
    );

    expect(result.precision).toBe("exact");
    // The kale huur exceeds the under-21 huurgrens, so the rekenhuur is capped.
    expect(result.value?.calculationRent).toEqual(euros(498.2));
    expect(result.value?.baseRent).toEqual(euros(202.52));
    expect(result.value?.partA).toEqual(euros(295.68));
    expect(result.value?.partB).toEqual(eur(0));
    expect(result.value?.partC).toEqual(eur(0));
    expect(result.value?.incomeCorrection).toEqual(eur(0));
    expect(result.value?.monthlyAllowance).toEqual(euros(295));
    expect(result.value?.annualAllowance).toEqual(euros(295 * 12));
  });

  test("example 2: couple with a child, rent € 1.200, joint income € 34.000", () => {
    const result = calculateHuurtoeslag(
      base({
        bareRentMonthly: euros(1_200),
        householdSize: 3,
        hasBenefitPartner: true,
        coResidentCount: 1,
        memberIncomes: [income(26_000), income(8_000)],
      }),
    );

    expect(result.value?.calculationRent).toEqual(euros(932.93));
    expect(result.value?.baseRent).toEqual(euros(200.71));
    expect(result.value?.cappingLimit).toEqual(euros(764.14));
    expect(result.value?.calculationIncome).toEqual(euros(34_000));
    expect(result.value?.partA).toEqual(euros(297.49));
    expect(result.value?.partB).toEqual(euros(172.86));
    expect(result.value?.partC).toEqual(euros(67.51));
    expect(result.value?.incomeCorrection).toEqual(euros(45.83));
    expect(result.value?.monthlyAllowance).toEqual(euros(492));
  });

  test("example 3: single person of 69, rent € 710, income € 29.000", () => {
    const result = calculateHuurtoeslag(
      base({
        bareRentMonthly: euros(710),
        householdSize: 1,
        memberIncomes: [income(29_000)],
      }),
    );

    expect(result.value?.calculationRent).toEqual(euros(710));
    expect(result.value?.cappingLimit).toEqual(euros(713.02));
    expect(result.value?.partA).toEqual(euros(295.68));
    expect(result.value?.partB).toEqual(euros(137.67));
    expect(result.value?.partC).toEqual(eur(0));
    // The leaflet prints € 125,44 here; the exact correction is € 125,4375 and
    // the published monthly result is reproduced either way.
    expect(result.value?.incomeCorrection).toEqual(euros(125.43));
    expect(result.value?.monthlyAllowance).toEqual(euros(307));
  });
});

describe("boundaries and exclusions", () => {
  test("rent at or below the base rent produces no allowance", () => {
    const p = HUURTOESLAG_2026.parameters;
    const atBaseRent = calculateHuurtoeslag(
      base({ bareRentMonthly: eur(p.baseRentSinglePersonCents) }),
    );
    const oneCentAbove = calculateHuurtoeslag(
      base({ bareRentMonthly: eur(p.baseRentSinglePersonCents + 1) }),
    );

    expect(atBaseRent.value?.blockedBy).toBe("calculation_rent_not_above_base_rent");
    expect(atBaseRent.value?.monthlyAllowance).toEqual(eur(0));
    expect(oneCentAbove.value?.partA).toEqual(eur(1));
  });

  test("rent above the huurgrens is capped rather than rejected", () => {
    const p = HUURTOESLAG_2026.parameters;
    const result = calculateHuurtoeslag(base({ bareRentMonthly: euros(2_000) }));
    expect(result.value?.calculationRent).toEqual(eur(p.rentLimitStandardCents));
  });

  test("the capping limit switches at three household members", () => {
    const two = calculateHuurtoeslag(base({ householdSize: 2, hasBenefitPartner: true }));
    const three = calculateHuurtoeslag(base({ householdSize: 3, hasBenefitPartner: true }));
    expect(two.value?.cappingLimit).toEqual(euros(713.02));
    expect(three.value?.cappingLimit).toEqual(euros(764.14));
  });

  test("only a resident child's income above the exemption counts", () => {
    const p = HUURTOESLAG_2026.parameters;
    const exempt = calculateHuurtoeslag(
      base({
        householdSize: 2,
        coResidentCount: 1,
        memberIncomes: [income(20_000), income(p.childIncomeExemptionCents / 100, true)],
      }),
    );
    const justAbove = calculateHuurtoeslag(
      base({
        householdSize: 2,
        coResidentCount: 1,
        memberIncomes: [
          income(20_000),
          {
            toetsingsinkomen: eur(p.childIncomeExemptionCents + 100),
            isResidentChildUnderExemptionAge: true,
          },
        ],
      }),
    );

    expect(exempt.value?.calculationIncome).toEqual(euros(20_000));
    expect(justAbove.value?.calculationIncome).toEqual(eur(2_000_100));
  });

  test("a negative household income floors the calculation income at zero", () => {
    const result = calculateHuurtoeslag(
      base({
        householdSize: 2,
        hasBenefitPartner: true,
        memberIncomes: [income(10_000), income(-15_000)],
      }),
    );
    expect(result.value?.calculationIncome).toEqual(eur(0));
    expect(result.value?.incomeCorrection).toEqual(eur(0));
  });

  test("the correction starts exactly above the reference point", () => {
    const p = HUURTOESLAG_2026.parameters;
    const at = calculateHuurtoeslag(
      base({ memberIncomes: [income(p.incomeReferencePointSinglePersonCents / 100)] }),
    );
    const above = calculateHuurtoeslag(
      base({
        memberIncomes: [
          {
            toetsingsinkomen: eur(p.incomeReferencePointSinglePersonCents + 100_000),
            isResidentChildUnderExemptionAge: false,
          },
        ],
      }),
    );

    expect(at.value?.incomeCorrection).toEqual(eur(0));
    // € 1.000 above the reference point at 27%/12 is € 22,50 per month.
    expect(above.value?.incomeCorrection).toEqual(euros(22.5));
  });

  test("assets one cent above the limit remove the entitlement", () => {
    const p = HUURTOESLAG_2026.parameters;
    const limit = p.maximumAssetsWithPartnerCents + p.maximumAssetsPerCoResidentCents;
    const at = calculateHuurtoeslag(
      base({
        hasBenefitPartner: true,
        householdSize: 3,
        coResidentCount: 1,
        combinedAssets: eur(limit),
      }),
    );
    const above = calculateHuurtoeslag(
      base({
        hasBenefitPartner: true,
        householdSize: 3,
        coResidentCount: 1,
        combinedAssets: eur(limit + 1),
      }),
    );

    expect(at.value?.blockedBy).toBeUndefined();
    expect(above.value?.blockedBy).toBe("assets_above_limit");
  });

  test("exceptional situations return a typed limitation instead of a number", () => {
    const result = calculateHuurtoeslag(base({ ordinaryHousehold: false }));
    expect(result.precision).toBe("unsupported");
    expect(result.value).toBeUndefined();
    expect(result.limitations[0]?.code).toBe("nl_huurtoeslag_exceptional_situation_not_supported");
  });

  test("an all-under-21 household with a child is not resolved by the source", () => {
    const result = calculateHuurtoeslag(
      base({ everyMemberUnder21: true, under21WithChildOrHandicap: true }),
    );
    expect(result.precision).toBe("unsupported");
    expect(result.limitations[0]?.code).toBe(
      "nl_huurtoeslag_under21_with_child_or_handicap_unresolved",
    );
  });
});
