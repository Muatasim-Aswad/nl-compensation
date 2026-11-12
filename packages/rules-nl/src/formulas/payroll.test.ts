import { eur } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { PAYROLL_2026 } from "../rules/payroll-2026.js";
import type { SpecialRemunerationInput } from "./payroll.js";
import {
  averageMonthlyNet,
  calculateSpecialRemunerationWithholding,
  estimateRegularPeriodWithholding,
  settlementEstimate,
} from "./payroll.js";

const euros = (amount: number) => eur(Math.round(amount * 100));

const special = (overrides: Partial<SpecialRemunerationInput> = {}): SpecialRemunerationInput => ({
  annualWage: euros(55_200),
  payment: euros(4_416),
  payrollTaxCreditApplied: true,
  underAowAge: true,
  residentOfNetherlands: true,
  ...overrides,
});

describe("witte tabel bijzondere beloningen", () => {
  test("holiday allowance on a € 55.200 jaarloon uses 37,56% plus 12,91%", () => {
    const result = calculateSpecialRemunerationWithholding(special());

    expect(result.precision).toBe("exact");
    expect(result.value?.appliedRatePpm).toBe(504_700);
    // € 4.416,00 x 50,47% = € 2.228,7552, rounded down in the employee's favour.
    expect(result.value?.withholding).toEqual(euros(2_228.75));
    expect(result.value?.netPayment).toEqual(euros(2_187.25));
  });

  test("without the payroll tax credit only the standard rate applies", () => {
    const result = calculateSpecialRemunerationWithholding(
      special({ payrollTaxCreditApplied: false }),
    );
    expect(result.value?.appliedRatePpm).toBe(375_600);
    expect(result.value?.withholding).toEqual(euros(1_658.64));
  });

  test("the negative offset below the credit build-up lowers the rate", () => {
    const atRowStart = calculateSpecialRemunerationWithholding(
      special({ annualWage: euros(11_358) }),
    );
    const justBelow = calculateSpecialRemunerationWithholding(
      special({ annualWage: eur(1_135_799) }),
    );

    expect(atRowStart.value?.appliedRatePpm).toBe(357_500 - 83_200);
    expect(justBelow.value?.appliedRatePpm).toBe(0);
    expect(justBelow.value?.withholding).toEqual(eur(0));
  });

  test("every published row boundary selects that row", () => {
    for (const row of PAYROLL_2026.parameters.specialRemunerationUnderAowAge) {
      const result = calculateSpecialRemunerationWithholding(
        special({ annualWage: eur(row.fromAnnualWageCents) }),
      );
      expect(result.value?.appliedRatePpm).toBe(row.standardRatePpm + row.creditOffsetRatePpm);
    }
  });

  test("the highest rows apply the top band", () => {
    expect(
      calculateSpecialRemunerationWithholding(special({ annualWage: euros(78_427) })).value
        ?.appliedRatePpm,
    ).toBe(560_100);
    expect(
      calculateSpecialRemunerationWithholding(special({ annualWage: euros(200_000) })).value
        ?.appliedRatePpm,
    ).toBe(495_000);
  });

  test("categories outside the supported case return a limitation", () => {
    expect(calculateSpecialRemunerationWithholding(special({ underAowAge: false })).precision).toBe(
      "unsupported",
    );
    expect(
      calculateSpecialRemunerationWithholding(special({ residentOfNetherlands: false })).precision,
    ).toBe("unsupported");
  });
});

describe("regular white-table payslip withholding", () => {
  const regular = {
    periodWage: euros(4_600),
    underAowAge: true,
    residentOfNetherlands: true,
    payrollTaxCreditApplied: true,
    periodsPerYear: 12,
  };

  test("uses the nearest lower published monthly row", () => {
    const result = estimateRegularPeriodWithholding(regular);

    expect(result.precision).toBe("exact");
    expect(result.value?.annualWithholding).toEqual(euros(13_476));
    expect(result.value?.periodWithholding).toEqual(euros(1_123));
  });

  test("supports thirteen four-weekly periods", () => {
    const result = estimateRegularPeriodWithholding({
      ...regular,
      periodWage: euros(4_246.15),
      periodsPerYear: 13,
    });
    expect(result.value?.periodsPerYear).toBe(13);
    expect(result.value?.periodWithholding).toEqual(euros(1_036.62));
  });

  test("matches the official EUR 5.000 monthly example", () => {
    const result = estimateRegularPeriodWithholding({ ...regular, periodWage: euros(5_000) });
    expect(result.value?.periodWithholding).toEqual(euros(1_325.08));
  });

  test("selects the without-credit column", () => {
    const result = estimateRegularPeriodWithholding({
      ...regular,
      periodWage: euros(5_000),
      payrollTaxCreditApplied: false,
    });
    expect(result.value?.periodWithholding).toEqual(euros(1_819.08));
  });

  test("an unsupported annual case is not turned into a payslip number", () => {
    const result = estimateRegularPeriodWithholding({ ...regular, underAowAge: false });
    expect(result.precision).toBe("unsupported");
    expect(result.value).toBeUndefined();
  });

  test("a non-positive period count is rejected", () => {
    expect(estimateRegularPeriodWithholding({ ...regular, periodsPerYear: 0 }).precision).toBe(
      "unsupported",
    );
  });

  test("the periodic wage tables are included in the current bundle", () => {
    expect(PAYROLL_2026.parameters.periodTablesIncluded).toBe(true);
  });
});

describe("settlement and average net", () => {
  test("a refund is reported as a settlement, never as compensation", () => {
    expect(settlementEstimate(euros(14_000), euros(13_484.01))).toEqual(euros(515.99));
    expect(settlementEstimate(euros(13_000), euros(13_484.01))).toEqual(euros(-484.01));
  });

  test("average monthly net divides the annual net by twelve", () => {
    expect(averageMonthlyNet(euros(41_715.99))).toEqual(euros(3_476.33));
  });
});
