import { eur } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { calculateHuurtoeslag, type HuurtoeslagInput } from "./formulas/huurtoeslag.js";
import { calculateAnnualIncomeTax } from "./formulas/income-tax.js";
import { calculateSpecialRemunerationWithholding } from "./formulas/payroll.js";
import { calculateZorgtoeslag, type ZorgtoeslagInput } from "./formulas/zorgtoeslag.js";
import { ALL_SOURCES } from "./provenance/sources.js";
import { BUNDLE_2026, findRuleById, ruleSelectionFor } from "./rules/bundle.js";
import { canonicalize, contentHashOf } from "./support/hash.js";

const euros = (amount: number) => eur(Math.round(amount * 100));

const netIncomeAfterTax = (grossEuros: number): number => {
  const outcome = calculateAnnualIncomeTax({
    taxableIncomeBox1: euros(grossEuros),
    employmentIncome: euros(grossEuros),
    underAowAge: true,
    domesticTaxpayer: true,
    applyTaxCredits: true,
  });
  if (outcome.value === undefined) throw new Error("supported case returned no value");
  return grossEuros * 100 - outcome.value.netTax.amountCents;
};

const singleZorg = (income: number, overrides: Partial<ZorgtoeslagInput> = {}) =>
  calculateZorgtoeslag({
    applicantToetsingsinkomen: euros(income),
    hasBenefitPartner: false,
    applicantInsuredForDutchHealthcare: true,
    combinedAssets: eur(0),
    residentOfNetherlands: true,
    ...overrides,
  });

const singleHuur = (overrides: Partial<HuurtoeslagInput> = {}) =>
  calculateHuurtoeslag({
    bareRentMonthly: euros(710),
    householdSize: 1,
    hasBenefitPartner: false,
    coResidentCount: 0,
    everyMemberUnder21: false,
    under21WithChildOrHandicap: false,
    memberIncomes: [{ toetsingsinkomen: euros(29_000), isResidentChildUnderExemptionAge: false }],
    combinedAssets: eur(0),
    ordinaryHousehold: true,
    ...overrides,
  });

describe("audit: provenance is reproducible", () => {
  test("every content hash is a prefixed SHA-256 of the canonical encoding", () => {
    // This package hashes without `node:crypto` so the browser bundle and the
    // CLI produce identical digests; `apps/cli` pins that implementation to the
    // platform digest, which only that workspace has the types to reach.
    expect(canonicalize({ ratePpm: 137_300 })).toBe('{"ratePpm":137300}');
    expect(contentHashOf({ ratePpm: 137_300 })).toMatch(/^sha256:[0-9a-f]{64}$/);
    for (const rule of [
      BUNDLE_2026.employment,
      BUNDLE_2026.incomeTax,
      BUNDLE_2026.payroll,
      BUNDLE_2026.zorgtoeslag,
      BUNDLE_2026.huurtoeslag,
      BUNDLE_2026.reimbursements,
    ]) {
      expect(rule.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  test("the manifest resolves every selected rule and its recorded hash", () => {
    const selection = ruleSelectionFor(BUNDLE_2026);
    expect(selection.ruleIds).toHaveLength(6);
    expect(new Set(selection.ruleIds).size).toBe(6);
    for (const id of selection.ruleIds) {
      const rule = findRuleById(id);
      expect(rule?.id).toBe(id);
      expect(selection.ruleContentHashes[id]).toBe(rule?.contentHash);
    }
    expect(findRuleById("nl-income-tax-2027-r1")).toBeUndefined();
  });

  test("every active source is dated and carries a byte hash", () => {
    expect(ALL_SOURCES.length).toBeGreaterThanOrEqual(12);
    for (const source of ALL_SOURCES) {
      expect(source.title.length).toBeGreaterThan(0);
      expect(source.url.startsWith("https://")).toBe(true);
      expect(source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(source.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  test("every rule names at least one source and a verification date", () => {
    for (const id of ruleSelectionFor(BUNDLE_2026).ruleIds) {
      const rule = findRuleById(id);
      expect(rule?.sources.length ?? 0).toBeGreaterThan(0);
      expect(rule?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("audit: adversarial boundaries", () => {
  test("zorgtoeslag stops one cent above the income ceiling, not at it", () => {
    expect(singleZorg(40_857).value?.blockedBy).toBeUndefined();
    const above = calculateZorgtoeslag({
      applicantToetsingsinkomen: eur(4_085_701),
      hasBenefitPartner: false,
      applicantInsuredForDutchHealthcare: true,
      combinedAssets: eur(0),
      residentOfNetherlands: true,
    });
    expect(above.value?.blockedBy).toBe("income_above_limit");
    expect(above.value?.annualAllowance.amountCents).toBe(0);
  });

  test("zorgtoeslag assets block only above the published maximum", () => {
    expect(singleZorg(19_000, { combinedAssets: euros(146_011) }).value?.blockedBy).toBeUndefined();
    expect(singleZorg(19_000, { combinedAssets: eur(14_601_101) }).value?.blockedBy).toBe(
      "assets_above_limit",
    );
  });

  test("zorgtoeslag never decreases when income falls", () => {
    let previous = -1;
    for (let income = 40_900; income >= 10_000; income -= 100) {
      const outcome = singleZorg(income);
      const value = outcome.value?.annualAllowance.amountCents ?? 0;
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  test("huurtoeslag asset ceiling rises by exactly one allowance per co-resident", () => {
    const withTwoCoResidents = {
      householdSize: 3,
      coResidentCount: 2,
      memberIncomes: [{ toetsingsinkomen: euros(20_000), isResidentChildUnderExemptionAge: false }],
    } as const;
    expect(
      singleHuur({ ...withTwoCoResidents, combinedAssets: euros(38_479 * 3) }).value?.blockedBy,
    ).toBeUndefined();
    expect(
      singleHuur({ ...withTwoCoResidents, combinedAssets: eur(38_479 * 300 + 1) }).value?.blockedBy,
    ).toBe("assets_above_limit");
  });

  test("huurtoeslag pays nothing once the rent falls to the base rent", () => {
    expect(singleHuur({ bareRentMonthly: euros(202.52) }).value?.blockedBy).toBe(
      "calculation_rent_not_above_base_rent",
    );
    expect(singleHuur({ bareRentMonthly: eur(20_253) }).value?.blockedBy).toBeUndefined();
  });

  test("huurtoeslag never rises when the rekeninkomen rises", () => {
    let previous = Number.MAX_SAFE_INTEGER;
    for (let income = 10_000; income <= 60_000; income += 250) {
      const outcome = singleHuur({
        memberIncomes: [
          { toetsingsinkomen: euros(income), isResidentChildUnderExemptionAge: false },
        ],
      });
      const value = outcome.value?.annualAllowance.amountCents ?? 0;
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  test("an exempt child's income only counts above the exemption", () => {
    const below = singleHuur({
      householdSize: 2,
      coResidentCount: 1,
      memberIncomes: [
        { toetsingsinkomen: euros(20_000), isResidentChildUnderExemptionAge: false },
        { toetsingsinkomen: euros(6_218), isResidentChildUnderExemptionAge: true },
      ],
    });
    const at = singleHuur({
      householdSize: 2,
      coResidentCount: 1,
      memberIncomes: [
        { toetsingsinkomen: euros(20_000), isResidentChildUnderExemptionAge: false },
        { toetsingsinkomen: eur(0), isResidentChildUnderExemptionAge: true },
      ],
    });
    expect(below.value?.calculationIncome.amountCents).toBe(
      at.value?.calculationIncome.amountCents,
    );
  });

  test("an unsupported case never falls through to an ordinary-case amount", () => {
    const aowAge = calculateAnnualIncomeTax({
      taxableIncomeBox1: euros(40_000),
      employmentIncome: euros(40_000),
      underAowAge: false,
      domesticTaxpayer: true,
      applyTaxCredits: true,
    });
    expect(aowAge.precision).toBe("unsupported");
    expect(aowAge.value).toBeUndefined();
    expect(aowAge.limitations[0]?.code).toBe("nl_tax_aow_age_not_supported");

    const abroad = singleZorg(19_000, { residentOfNetherlands: false });
    expect(abroad.precision).toBe("unsupported");
    expect(abroad.value).toBeUndefined();

    const youthWithChild = singleHuur({
      everyMemberUnder21: true,
      under21WithChildOrHandicap: true,
    });
    expect(youthWithChild.precision).toBe("unsupported");
    expect(youthWithChild.value).toBeUndefined();
  });
});

describe("audit: declared monotonicity holds", () => {
  test("more guaranteed cash never lowers income after tax, across every band edge", () => {
    const edges = [0, 11_965, 25_845, 29_736, 38_883, 45_592, 78_426, 132_920, 150_000] as const;
    for (const edge of edges) {
      for (const offset of [-2, -1, 0, 1, 2]) {
        const gross = edge + offset;
        if (gross < 0) continue;
        expect(netIncomeAfterTax(gross + 1)).toBeGreaterThan(netIncomeAfterTax(gross));
      }
    }
  });

  test("the marginal tax rate never reaches 100% anywhere in the supported range", () => {
    for (let gross = 0; gross <= 200_000; gross += 500) {
      const step = netIncomeAfterTax(gross + 500) - netIncomeAfterTax(gross);
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThanOrEqual(50_000);
    }
  });

  test("special-remuneration withholding is proportional and never exceeds the payment", () => {
    for (const jaarloon of [0, 11_358, 12_923, 23_931, 29_737, 38_884, 45_593, 78_427, 143_555]) {
      for (const withCredit of [true, false]) {
        const outcome = calculateSpecialRemunerationWithholding({
          annualWage: euros(jaarloon),
          payment: euros(4_416),
          payrollTaxCreditApplied: withCredit,
          underAowAge: true,
          residentOfNetherlands: true,
        });
        const withholding = outcome.value?.withholding.amountCents ?? -1;
        expect(withholding).toBeGreaterThanOrEqual(0);
        expect(withholding).toBeLessThan(441_600);
        expect(outcome.value?.netPayment.amountCents).toBe(441_600 - withholding);
      }
    }
  });

  test("results are deterministic for the same input", () => {
    const first = JSON.stringify(singleHuur().value);
    const second = JSON.stringify(singleHuur().value);
    expect(first).toBe(second);
    expect(JSON.stringify(singleZorg(19_000).value)).toBe(JSON.stringify(singleZorg(19_000).value));
  });
});
