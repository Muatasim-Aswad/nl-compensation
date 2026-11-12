import { eur } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { EMPLOYMENT_2026 } from "../rules/employment-2026.js";
import { fromInt } from "../support/rational.js";
import {
  decomposeCaoRijkIkb,
  statutoryHolidayAllowance,
  statutoryLeaveHoursPerYear,
} from "./employment.js";

const euros = (amount: number) => eur(Math.round(amount * 100));

describe("statutory holiday allowance", () => {
  test("is 8% of the gross annual salary", () => {
    // The € 4.600 monthly base case: € 55.200 x 8% = € 4.416.
    expect(statutoryHolidayAllowance(euros(55_200)).value).toEqual(euros(4_416));
    expect(statutoryHolidayAllowance(euros(55_200)).precision).toBe("exact");
  });

  test("the total including the allowance matches the plan's golden figure", () => {
    const base = euros(55_200);
    const allowance = statutoryHolidayAllowance(base).value!;
    expect(base.amountCents + allowance.amountCents).toBe(euros(59_616).amountCents);
  });

  test("uses the published rate rather than a hard-coded constant", () => {
    expect(EMPLOYMENT_2026.parameters.statutoryHolidayAllowanceRatePpm).toBe(80_000);
  });
});

describe("statutory leave", () => {
  test("is four times the weekly working hours", () => {
    expect(statutoryLeaveHoursPerYear(fromInt(40))).toEqual(fromInt(160));
    expect(statutoryLeaveHoursPerYear(fromInt(36))).toEqual(fromInt(144));
    // The leaflet's own example: 25 hours a week gives 100 hours a year.
    expect(statutoryLeaveHoursPerYear(fromInt(25))).toEqual(fromInt(100));
  });

  test("keeps a fractional contract exact", () => {
    expect(statutoryLeaveHoursPerYear({ n: 65n, d: 2n })).toEqual({ n: 130n, d: 1n });
  });
});

describe("CAO Rijk IKB double counting", () => {
  test("splits the budget into its contained holiday allowance and the rest", () => {
    const result = decomposeCaoRijkIkb(euros(55_200));

    // 16,50% of € 55.200 is € 9.108, of which € 4.416 is the 8% allowance.
    expect(result.value?.annualBudget).toEqual(euros(9_108));
    expect(result.value?.containedHolidayAllowance).toEqual(euros(4_416));
    expect(result.value?.remainingBudget).toEqual(euros(4_692));
    expect(result.value?.minimumMonthlyBudget).toEqual(euros(452));
  });

  test("flags that a separate holiday allowance must not be added on top", () => {
    const result = decomposeCaoRijkIkb(euros(55_200));
    expect(result.value?.holidayAllowanceMustNotBeAddedSeparately).toBe(true);
    expect(result.assumptions.map((item) => item.code)).toContain("nl_cao_rijk_ikb_composition");
  });

  test("the contained allowance equals the statutory allowance for the same salary", () => {
    const salary = euros(48_000);
    expect(decomposeCaoRijkIkb(salary).value?.containedHolidayAllowance).toEqual(
      statutoryHolidayAllowance(salary).value,
    );
  });
});
