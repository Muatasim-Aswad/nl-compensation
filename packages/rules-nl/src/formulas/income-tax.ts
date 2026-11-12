import type { Money } from "@nl-compensation/core";
import type { CreditSegment, IncomeTaxRuleParameters, TaxBand } from "../rules/income-tax-2026.js";
import { INCOME_TAX_2026, INCOME_TAX_2026_RULE_ID } from "../rules/income-tax-2026.js";
import type { Fraction } from "../support/rational.js";
import {
  CENTS_PER_EURO,
  ZERO,
  add,
  clampAtZero,
  compare,
  fromInt,
  min,
  percentageOf,
  roundHalfAwayFromZero,
  sub,
  truncateToInteger,
} from "../support/rational.js";
import type { RuleOutcome } from "../support/result.js";
import { centsToMoney, supported, unsupported } from "../support/result.js";

export interface AnnualTaxInput {
  /** Box 1 taxable income: fiscal wage after pre-tax pension, plus other annual income. */
  readonly taxableIncomeBox1: Money;
  /** Arbeidsinkomen: income from current employment, which drives the labour tax credit. */
  readonly employmentIncome: Money;
  readonly underAowAge: boolean;
  readonly domesticTaxpayer: boolean;
  /** Whether the general and labour tax credits are claimed for this taxpayer. */
  readonly applyTaxCredits: boolean;
}

export interface AnnualTaxResult {
  readonly taxableIncome: Money;
  readonly grossTax: Money;
  readonly generalTaxCredit: Money;
  readonly labourTaxCredit: Money;
  readonly netTax: Money;
}

/** Truncates a cent amount to whole euros, expressed in cents, never below zero. */
export function truncateToWholeEuroCents(amountCents: number): Fraction {
  const positive = amountCents > 0 ? BigInt(amountCents) : 0n;
  return fromInt(truncateToInteger({ n: positive, d: CENTS_PER_EURO }) * CENTS_PER_EURO);
}

/** Sums the tax due in every band the income reaches. */
export function bandTax(bands: readonly TaxBand[], incomeCents: Fraction): Fraction {
  let total = ZERO;
  for (const band of bands) {
    const upper = band.toCents === null ? incomeCents : min(incomeCents, fromInt(band.toCents));
    const slice = clampAtZero(sub(upper, fromInt(band.fromCents)));
    total = add(total, percentageOf(slice, band.ratePpm));
  }
  return total;
}

/**
 * Published credit tables state each bound inclusively ("tot en met"), so an
 * income exactly on a boundary still belongs to the lower segment. The chosen
 * segment is therefore the last one whose lower bound is strictly below the
 * income, defaulting to the first segment.
 */
export function creditFromSegments(
  segments: readonly CreditSegment[],
  incomeCents: Fraction,
): Fraction {
  let selected = segments[0] as CreditSegment;
  for (const segment of segments) {
    if (compare(fromInt(segment.fromCents), incomeCents) < 0) {
      selected = segment;
    }
  }
  const excess = clampAtZero(sub(incomeCents, fromInt(selected.fromCents)));
  return clampAtZero(
    add(fromInt(selected.baseAmountCents), percentageOf(excess, selected.ratePpm)),
  );
}

/**
 * Annual Box 1 income tax for the supported case: a domestic taxpayer below the
 * AOW age.
 *
 * Rounding order, applied in this sequence and not re-derived elsewhere:
 * taxable income is truncated to whole euros; band tax and each credit are
 * computed exactly and then rounded to cents with ties away from zero; the net
 * tax is their difference, floored at zero. The result is labelled `estimated`
 * because the assessment's own rounding order is not published in the verified
 * sources.
 */
export function calculateAnnualIncomeTax(
  input: AnnualTaxInput,
  rule = INCOME_TAX_2026,
): RuleOutcome<AnnualTaxResult> {
  const parts = { ruleIds: [INCOME_TAX_2026_RULE_ID] };
  const parameters: IncomeTaxRuleParameters = rule.parameters;

  if (!input.underAowAge) {
    return unsupported(
      {
        code: "nl_tax_aow_age_not_supported",
        layer: "fiscal_payroll",
        message:
          "Only taxpayers below the AOW age are supported. AOW-age and transition-year rates are out of scope for this release.",
        affectedOutputs: ["fiscalPayroll.finalIncomeTaxAnnual"],
      },
      parts,
    );
  }
  if (!input.domesticTaxpayer) {
    return unsupported(
      {
        code: "nl_tax_non_domestic_not_supported",
        layer: "fiscal_payroll",
        message:
          "Only domestic taxpayers are supported. International taxation and the expat scheme are out of scope for this release.",
        affectedOutputs: ["fiscalPayroll.finalIncomeTaxAnnual"],
      },
      parts,
    );
  }

  const taxableCents = truncateToWholeEuroCents(input.taxableIncomeBox1.amountCents);
  const employmentCents = truncateToWholeEuroCents(input.employmentIncome.amountCents);

  const grossTaxCents = roundHalfAwayFromZero(
    bandTax(parameters.box1BandsUnderAowAge, taxableCents),
  );
  const generalCreditCents = input.applyTaxCredits
    ? roundHalfAwayFromZero(creditFromSegments(parameters.generalTaxCreditSegments, taxableCents))
    : 0n;
  const labourCreditCents = input.applyTaxCredits
    ? roundHalfAwayFromZero(creditFromSegments(parameters.labourTaxCreditSegments, employmentCents))
    : 0n;

  const difference = grossTaxCents - generalCreditCents - labourCreditCents;
  const netTaxCents = difference > 0n ? difference : 0n;

  return supported(
    "estimated",
    {
      taxableIncome: centsToMoney(BigInt(truncateToInteger(taxableCents))),
      grossTax: centsToMoney(grossTaxCents),
      generalTaxCredit: centsToMoney(generalCreditCents),
      labourTaxCredit: centsToMoney(labourCreditCents),
      netTax: centsToMoney(netTaxCents),
    },
    {
      ...parts,
      trace: [
        {
          id: "annual-income-tax",
          operation: "box1_bands_minus_credits",
          inputPaths: ["fiscal.taxableIncomeBox1", "fiscal.employmentIncome"],
          outputPath: "fiscalPayroll.finalIncomeTaxAnnual",
          ruleId: INCOME_TAX_2026_RULE_ID,
          rounding:
            "income truncated to whole euros; band tax and credits rounded to cents, ties away from zero",
        },
      ],
      assumptions: input.applyTaxCredits
        ? [
            {
              code: "nl_tax_credits_claimed",
              message:
                "The general and labour tax credits are settled in full for a whole calendar year of Dutch employment.",
              affectedPaths: ["fiscalPayroll.finalIncomeTaxAnnual"],
            },
          ]
        : [],
    },
  );
}
