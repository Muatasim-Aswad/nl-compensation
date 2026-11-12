import type { Money, Rational, ScaledPercentage } from "../model/scalars.js";
import { eur, percent, rational } from "../model/scalars.js";
import type { Value } from "../model/value.js";
import { exact, range, unknown, VALUE_KINDS } from "../model/value.js";
import {
  ContractValidationError,
  enumeration,
  integer,
  record,
  string,
  type Parser,
} from "./validation.js";

export const parseMoney: Parser<Money> = (input, path = "money") => {
  const value = record(input, path);
  if (value.currency !== "EUR") {
    throw new ContractValidationError([
      {
        path: `${path}.currency`,
        code: "incompatible_unit",
        message: "only EUR money is supported by this contract",
      },
    ]);
  }
  return eur(integer(value.amountCents, `${path}.amountCents`));
};

export const parseRational: Parser<Rational> = (input, path = "rational") => {
  const value = record(input, path);
  const numerator = integer(value.numerator, `${path}.numerator`);
  const denominator = integer(value.denominator, `${path}.denominator`);
  if (denominator <= 0) {
    throw new ContractValidationError([
      { path: `${path}.denominator`, code: "range", message: "must be greater than zero" },
    ]);
  }
  return rational(numerator, denominator);
};

export const parsePercentage: Parser<ScaledPercentage> = (input, path = "percentage") => {
  const value = record(input, path);
  return percent(integer(value.partsPerMillion, `${path}.partsPerMillion`));
};

export function valueParser<T>(
  parseItem: Parser<T>,
  compare: (left: T, right: T) => number,
): Parser<Value<T>> {
  return (input, path = "value") => {
    const value = record(input, path);
    const kind = enumeration(value.kind, VALUE_KINDS, `${path}.kind`);
    if (kind === "unknown") {
      return unknown(
        enumeration(
          value.reason,
          ["not_provided", "not_applicable", "not_known"] as const,
          `${path}.reason`,
        ),
      );
    }
    if (kind === "exact") {
      return exact(parseItem(value.value, `${path}.value`));
    }

    const min = parseItem(value.min, `${path}.min`);
    const max = parseItem(value.max, `${path}.max`);
    if (compare(min, max) > 0) {
      throw new ContractValidationError([
        { path, code: "range_order", message: "range minimum must not exceed maximum" },
      ]);
    }
    return range(min, max, string(value.correlationId, `${path}.correlationId`));
  };
}

export const parseMoneyValue = valueParser(
  parseMoney,
  (left, right) => left.amountCents - right.amountCents,
);

export const parseRationalValue = valueParser(parseRational, (left, right) => {
  return left.numerator * right.denominator - right.numerator * left.denominator;
});
