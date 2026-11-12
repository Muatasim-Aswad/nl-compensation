import { describe, expect, test } from "vite-plus/test";
import {
  add,
  clampAtZero,
  compare,
  div,
  floorToInteger,
  frac,
  fromInt,
  mul,
  percentageOf,
  roundHalfAwayFromZero,
  sub,
  toSafeCents,
  truncateToInteger,
} from "./rational.js";

describe("exact rational arithmetic", () => {
  test("keeps values that binary floating point cannot represent", () => {
    // 0,1 + 0,2 is not 0,3 in IEEE 754; it is here.
    expect(add(frac(1n, 10n), frac(2n, 10n))).toEqual(frac(3n, 10n));
  });

  test("normalizes sign and reduces to lowest terms", () => {
    expect(frac(4n, -8n)).toEqual({ n: -1n, d: 2n });
  });

  test("rejects a zero denominator", () => {
    expect(() => frac(1n, 0n)).toThrow(RangeError);
    expect(() => div(fromInt(1), fromInt(0))).toThrow(RangeError);
  });

  test("applies scaled percentages exactly", () => {
    // 13,73% of € 3.464,00 is € 475,6072: 47.560,72 cents, which no whole cent represents.
    expect(percentageOf(fromInt(346_400), 137_300)).toEqual(frac(4_756_072n, 100n));
    expect(percentageOf(fromInt(100_000), 80_000)).toEqual(fromInt(8_000));
  });

  test("orders and clamps", () => {
    expect(compare(frac(1n, 3n), frac(1n, 2n))).toBe(-1);
    expect(compare(frac(2n, 4n), frac(1n, 2n))).toBe(0);
    expect(clampAtZero(sub(fromInt(3), fromInt(5)))).toEqual(fromInt(0));
  });
});

describe("rounding modes", () => {
  test("floor goes down for negatives, truncate goes toward zero", () => {
    expect(floorToInteger(frac(-3n, 2n))).toBe(-2n);
    expect(truncateToInteger(frac(-3n, 2n))).toBe(-1n);
    expect(floorToInteger(frac(3n, 2n))).toBe(1n);
  });

  test("half away from zero breaks ties outward", () => {
    expect(roundHalfAwayFromZero(frac(5n, 2n))).toBe(3n);
    expect(roundHalfAwayFromZero(frac(-5n, 2n))).toBe(-3n);
    expect(roundHalfAwayFromZero(frac(4n, 3n))).toBe(1n);
  });

  test("the norm-premium case truncates rather than rounds up", () => {
    // 4,289% x € 29.736 is 127.537,704 cents and is published as € 1.275,37.
    const exact = percentageOf(fromInt(2_973_600), 42_890);
    expect(floorToInteger(exact)).toBe(127_537n);
    expect(roundHalfAwayFromZero(exact)).toBe(127_538n);
  });

  test("multiplication stays exact across a long chain", () => {
    const chain = mul(mul(frac(1n, 3n), frac(3n, 7n)), frac(7n, 11n));
    expect(chain).toEqual(frac(1n, 11n));
  });
});

describe("cent conversion", () => {
  test("rejects amounts outside the safe integer range", () => {
    expect(toSafeCents(123_456n)).toBe(123_456);
    expect(() => toSafeCents(2n ** 60n)).toThrow(RangeError);
  });
});
