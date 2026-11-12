import { eur } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { REIMBURSEMENTS_2026 } from "../rules/reimbursements-2026.js";
import { splitKilometreReimbursement } from "./reimbursements.js";

const euros = (amount: number) => eur(Math.round(amount * 100));

describe("kilometre reimbursement", () => {
  test("is fully exempt at the 2026 rate of € 0,25 per kilometre", () => {
    const result = splitKilometreReimbursement({ kilometres: 1_000, paidCentsPerKilometre: 25 });

    expect(result.value?.totalPaid).toEqual(euros(250));
    expect(result.value?.untaxedPortion).toEqual(euros(250));
    expect(result.value?.taxablePortion).toEqual(eur(0));
    expect(result.value?.exemptCentsPerKilometre).toBe(25);
  });

  test("treats the excess above the exempt rate as taxable wage", () => {
    const result = splitKilometreReimbursement({ kilometres: 1_000, paidCentsPerKilometre: 30 });
    expect(result.value?.untaxedPortion).toEqual(euros(250));
    expect(result.value?.taxablePortion).toEqual(euros(50));
  });

  test("never exempts more than the employer actually pays", () => {
    const result = splitKilometreReimbursement({ kilometres: 1_000, paidCentsPerKilometre: 20 });
    expect(result.value?.untaxedPortion).toEqual(euros(200));
    expect(result.value?.taxablePortion).toEqual(eur(0));
  });

  test("records the previous rate and its retroactive increase", () => {
    const p = REIMBURSEMENTS_2026.parameters;
    expect(p.previousUntaxedKilometreAllowanceCentsPerKilometre).toBe(23);
    expect(p.untaxedKilometreAllowanceCentsPerKilometre).toBe(25);
    expect(p.increaseAppliedRetroactivelyFromStartOfYear).toBe(true);
  });

  test("a reimbursement never counts toward Guaranteed Annual Cash", () => {
    const result = splitKilometreReimbursement({ kilometres: 5_000, paidCentsPerKilometre: 25 });
    expect(result.value?.countsTowardGuaranteedAnnualCash).toBe(false);
    expect(REIMBURSEMENTS_2026.parameters.countsTowardGuaranteedAnnualCash).toBe(false);
  });
});
