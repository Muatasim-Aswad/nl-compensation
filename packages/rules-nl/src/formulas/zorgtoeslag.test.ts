import { eur } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { ZORGTOESLAG_2026 } from "../rules/zorgtoeslag-2026.js";
import { fromInt, percentageOf, roundHalfAwayFromZero } from "../support/rational.js";
import type { ZorgtoeslagInput } from "./zorgtoeslag.js";
import { calculateZorgtoeslag } from "./zorgtoeslag.js";

const euros = (amount: number) => eur(Math.round(amount * 100));

const single = (income: number, overrides: Partial<ZorgtoeslagInput> = {}): ZorgtoeslagInput => ({
  applicantToetsingsinkomen: euros(income),
  hasBenefitPartner: false,
  applicantInsuredForDutchHealthcare: true,
  combinedAssets: eur(0),
  residentOfNetherlands: true,
  ...overrides,
});

describe("official rekenvoorbeelden from Berekening zorgtoeslag 2026", () => {
  test("example 1: single applicant with € 19.000", () => {
    const result = calculateZorgtoeslag(single(19_000));

    expect(result.precision).toBe("exact");
    expect(result.value?.normPremium).toEqual(euros(568.55));
    expect(result.value?.annualAllowance).toEqual(euros(1_550.45));
    expect(result.value?.monthlyAllowance).toEqual(euros(129));
  });

  test("example 2: applicant with an uninsured partner receives half", () => {
    const result = calculateZorgtoeslag({
      applicantToetsingsinkomen: euros(7_000),
      partnerToetsingsinkomen: euros(26_200),
      hasBenefitPartner: true,
      applicantInsuredForDutchHealthcare: true,
      partnerInsuredForDutchHealthcare: false,
      combinedAssets: eur(0),
      residentOfNetherlands: true,
    });

    expect(result.value?.jointToetsingsinkomen).toEqual(euros(33_200));
    expect(result.value?.normPremium).toEqual(euros(1_750.98));
    expect(result.value?.halvedForUninsuredPartner).toBe(true);
    expect(result.value?.annualAllowance).toEqual(euros(1_243.51));
    expect(result.value?.monthlyAllowance).toEqual(euros(103));
  });

  test("example 3: a client living abroad is unsupported, not approximated", () => {
    const result = calculateZorgtoeslag({
      applicantToetsingsinkomen: euros(12_000),
      partnerToetsingsinkomen: euros(11_000),
      hasBenefitPartner: true,
      applicantInsuredForDutchHealthcare: true,
      partnerInsuredForDutchHealthcare: false,
      combinedAssets: eur(0),
      residentOfNetherlands: false,
    });

    expect(result.precision).toBe("unsupported");
    expect(result.value).toBeUndefined();
    expect(result.limitations[0]?.code).toBe("nl_zorgtoeslag_non_resident_not_supported");
  });
});

describe("published maxima and cut-offs", () => {
  test("the maximum allowance at the threshold income matches the leaflet", () => {
    const p = ZORGTOESLAG_2026.parameters;
    // The leaflet states its maxima in whole euros, rounded to the nearest euro.
    const toWholeEuroCents = (cents: number | undefined): number =>
      Number(roundHalfAwayFromZero({ n: BigInt(cents ?? 0), d: 100n })) * 100;

    const atThreshold = calculateZorgtoeslag(single(p.thresholdIncomeCents / 100));
    expect(toWholeEuroCents(atThreshold.value?.annualAllowance.amountCents)).toBe(
      p.maximumAllowanceSingleCents,
    );

    const withPartner = calculateZorgtoeslag({
      applicantToetsingsinkomen: eur(p.thresholdIncomeCents),
      hasBenefitPartner: true,
      partnerToetsingsinkomen: eur(0),
      applicantInsuredForDutchHealthcare: true,
      partnerInsuredForDutchHealthcare: true,
      combinedAssets: eur(0),
      residentOfNetherlands: true,
    });
    expect(toWholeEuroCents(withPartner.value?.annualAllowance.amountCents)).toBe(
      p.maximumAllowanceWithPartnerCents,
    );
  });

  test("income one cent above the limit removes the entitlement", () => {
    const p = ZORGTOESLAG_2026.parameters;
    const atLimit = calculateZorgtoeslag(single(p.maximumIncomeSingleCents / 100));
    const overLimit = calculateZorgtoeslag({
      ...single(0),
      applicantToetsingsinkomen: eur(p.maximumIncomeSingleCents + 1),
    });

    expect(atLimit.value?.annualAllowance.amountCents).toBeGreaterThan(0);
    expect(overLimit.value?.blockedBy).toBe("income_above_limit");
    expect(overLimit.value?.annualAllowance).toEqual(eur(0));
  });

  test("assets one cent above the limit remove the entitlement", () => {
    const p = ZORGTOESLAG_2026.parameters;
    const atLimit = calculateZorgtoeslag(
      single(19_000, { combinedAssets: eur(p.maximumAssetsSingleCents) }),
    );
    const overLimit = calculateZorgtoeslag(
      single(19_000, { combinedAssets: eur(p.maximumAssetsSingleCents + 1) }),
    );

    expect(atLimit.value?.annualAllowance).toEqual(euros(1_550.45));
    expect(overLimit.value?.blockedBy).toBe("assets_above_limit");
  });

  test("an uninsured applicant has no entitlement", () => {
    const result = calculateZorgtoeslag(
      single(19_000, { applicantInsuredForDutchHealthcare: false }),
    );
    expect(result.value?.blockedBy).toBe("applicant_not_insured");
    expect(result.value?.annualAllowance).toEqual(eur(0));
  });

  test("the negative half of the norm premium formula counts as zero", () => {
    const wellBelow = calculateZorgtoeslag(single(1_000));
    const atThreshold = calculateZorgtoeslag(
      single(ZORGTOESLAG_2026.parameters.thresholdIncomeCents / 100),
    );
    expect(wellBelow.value?.normPremium).toEqual(atThreshold.value?.normPremium);
  });

  test("the client's own insurance premium is not an input", () => {
    // The public input type has no premium field; this asserts the shape stays that way.
    const keys = Object.keys(single(19_000));
    expect(keys.some((key) => key.toLowerCase().includes("premium"))).toBe(false);
  });

  test("the norm premium is derived from the published percentages", () => {
    const p = ZORGTOESLAG_2026.parameters;
    const expected = percentageOf(fromInt(p.thresholdIncomeCents), p.normPremiumBaseRateSinglePpm);
    const result = calculateZorgtoeslag(single(1_000));
    expect(result.value?.normPremium.amountCents).toBe(Number(expected.n / expected.d));
  });
});
