import { eur } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { INCOME_TAX_2026 } from "../rules/income-tax-2026.js";
import type { AnnualTaxInput } from "./income-tax.js";
import { calculateAnnualIncomeTax } from "./income-tax.js";

const euros = (amount: number) => eur(Math.round(amount * 100));

const supported = (income: number, overrides: Partial<AnnualTaxInput> = {}): AnnualTaxInput => ({
  taxableIncomeBox1: euros(income),
  employmentIncome: euros(income),
  underAowAge: true,
  domesticTaxpayer: true,
  applyTaxCredits: true,
  ...overrides,
});

describe("independently calculated annual tax", () => {
  test("€ 55.200 of employment income, the € 4.600 monthly base case", () => {
    const result = calculateAnnualIncomeTax(supported(55_200));

    // Band 1: € 38.883 x 35,75% = € 13.900,6725
    // Band 2: € 16.317 x 37,56% = €  6.128,6652
    expect(result.value?.grossTax).toEqual(euros(20_029.34));
    // € 3.115 - 6,398% x € 25.464 = € 1.485,81328
    expect(result.value?.generalTaxCredit).toEqual(euros(1_485.81));
    // € 5.685 - 6,510% x € 9.608 = € 5.059,5192
    expect(result.value?.labourTaxCredit).toEqual(euros(5_059.52));
    expect(result.value?.netTax).toEqual(euros(13_484.01));
    expect(result.precision).toBe("estimated");
  });

  test("€ 25.000 of employment income", () => {
    const result = calculateAnnualIncomeTax(supported(25_000));

    // € 25.000 x 35,75% = € 8.937,50
    expect(result.value?.grossTax).toEqual(euros(8_937.5));
    expect(result.value?.generalTaxCredit).toEqual(euros(3_115));
    // € 996 + 31,009% x € 13.035 = € 5.038,02
    expect(result.value?.labourTaxCredit).toEqual(euros(5_038.02));
    expect(result.value?.netTax).toEqual(euros(784.48));
  });

  test("€ 100.000 reaches the top band and exhausts both credits", () => {
    const result = calculateAnnualIncomeTax(supported(100_000));

    // € 13.900,6725 + € 14.852,3508 + € 10.679,13
    expect(result.value?.grossTax).toEqual(euros(39_432.15));
    expect(result.value?.generalTaxCredit).toEqual(eur(0));
    // € 5.685 - 6,510% x € 54.408 = € 2.143,0392
    expect(result.value?.labourTaxCredit).toEqual(euros(2_143.04));
    expect(result.value?.netTax).toEqual(euros(37_289.11));
  });

  test("credits cannot push the tax below zero", () => {
    // € 3.575,00 of tax against € 3.115,00 + € 832,40 of credits.
    expect(calculateAnnualIncomeTax(supported(10_000)).value?.netTax).toEqual(eur(0));
    // Just above that point the tax becomes positive rather than negative.
    expect(calculateAnnualIncomeTax(supported(12_000)).value?.netTax).toEqual(euros(168.15));
  });
});

describe("threshold-adjacent values", () => {
  const p = INCOME_TAX_2026.parameters;
  const bandOneTop = p.box1BandsUnderAowAge[1]!.fromCents / 100;
  const bandTwoTop = p.box1BandsUnderAowAge[2]!.fromCents / 100;

  test("the first band boundary is inclusive", () => {
    const at = calculateAnnualIncomeTax(supported(bandOneTop));
    const above = calculateAnnualIncomeTax(supported(bandOneTop + 1));

    expect(at.value?.grossTax).toEqual(euros(13_900.67));
    // One euro more is taxed at the second band rate of 37,56%.
    expect(above.value!.grossTax.amountCents - at.value!.grossTax.amountCents).toBe(38);
  });

  test("the second band boundary is inclusive", () => {
    const at = calculateAnnualIncomeTax(supported(bandTwoTop));
    const above = calculateAnnualIncomeTax(supported(bandTwoTop + 1));
    expect(above.value!.grossTax.amountCents - at.value!.grossTax.amountCents).toBe(50);
  });

  test("the general credit stays at its base amount up to and including its threshold", () => {
    const threshold = p.generalTaxCreditSegments[1]!.fromCents / 100;
    const at = calculateAnnualIncomeTax(supported(threshold));
    const above = calculateAnnualIncomeTax(supported(threshold + 1));

    expect(at.value?.generalTaxCredit).toEqual(euros(3_115));
    expect(above.value?.generalTaxCredit).toEqual(euros(3_114.94));
  });

  test("the general credit reaches exactly zero at its published end point", () => {
    const end = p.generalTaxCreditSegments[2]!.fromCents / 100;
    expect(calculateAnnualIncomeTax(supported(end)).value?.generalTaxCredit).toEqual(eur(0));
    expect(calculateAnnualIncomeTax(supported(end + 1)).value?.generalTaxCredit).toEqual(eur(0));
  });

  test("the labour credit reaches zero at € 132.920 and stays there", () => {
    const end = p.labourTaxCreditSegments[4]!.fromCents / 100;
    expect(calculateAnnualIncomeTax(supported(end)).value?.labourTaxCredit).toEqual(eur(0));
    expect(calculateAnnualIncomeTax(supported(end + 10_000)).value?.labourTaxCredit).toEqual(
      eur(0),
    );
  });

  test("each labour-credit build-up boundary is continuous within a cent", () => {
    for (const segment of p.labourTaxCreditSegments.slice(1, 4)) {
      const boundary = segment.fromCents / 100;
      const below = calculateAnnualIncomeTax(supported(boundary)).value!.labourTaxCredit;
      const above = calculateAnnualIncomeTax(supported(boundary + 1)).value!.labourTaxCredit;
      expect(Math.abs(above.amountCents - below.amountCents)).toBeLessThan(35);
    }
  });
});

describe("unsupported categories never fall through", () => {
  test("AOW age and older", () => {
    const result = calculateAnnualIncomeTax(supported(40_000, { underAowAge: false }));
    expect(result.precision).toBe("unsupported");
    expect(result.value).toBeUndefined();
    expect(result.limitations[0]?.code).toBe("nl_tax_aow_age_not_supported");
  });

  test("non-domestic taxpayers", () => {
    const result = calculateAnnualIncomeTax(supported(40_000, { domesticTaxpayer: false }));
    expect(result.precision).toBe("unsupported");
    expect(result.limitations[0]?.code).toBe("nl_tax_non_domestic_not_supported");
  });

  test("the rule declares that AOW-age rates are out of scope", () => {
    expect(INCOME_TAX_2026.parameters.aowAgeAndOlderSupported).toBe(false);
  });
});

describe("determinism and pension treatment", () => {
  test("the same input always produces the same result", () => {
    const first = calculateAnnualIncomeTax(supported(61_234.56));
    const second = calculateAnnualIncomeTax(supported(61_234.56));
    expect(first).toEqual(second);
  });

  test("employee pension premiums are declared as already reducing the fiscal wage", () => {
    expect(INCOME_TAX_2026.parameters.employeePensionPremiumReducesFiscalWage).toBe(true);
  });

  test("adding guaranteed cash never lowers the income after tax", () => {
    let previousNet = -Infinity;
    for (let income = 10_000; income <= 150_000; income += 1_000) {
      const result = calculateAnnualIncomeTax(supported(income));
      const net = income * 100 - result.value!.netTax.amountCents;
      expect(net).toBeGreaterThan(previousNet);
      previousNet = net;
    }
  });
});
