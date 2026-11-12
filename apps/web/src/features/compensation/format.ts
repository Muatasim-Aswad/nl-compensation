import type { Money, Value } from "@nl-compensation/core";
import { copy } from "./copy.js";

export type RangeDisplayMode = "minimum" | "maximum" | "average" | "both";

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const wholeEuro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(money: Money, roundToWholeEuro = false): string {
  return (roundToWholeEuro ? wholeEuro : euro).format(money.amountCents / 100);
}

export function formatMoneyValue(value: Value<Money>, roundToWholeEuro = false): string {
  if (value.kind === "unknown") {
    return value.reason === "not_applicable"
      ? copy.formatting.notApplicable
      : copy.formatting.unavailable;
  }
  if (value.kind === "range") {
    return `${formatMoney(value.min, roundToWholeEuro)} – ${formatMoney(value.max, roundToWholeEuro)}`;
  }
  return formatMoney(value.value, roundToWholeEuro);
}

export function labelPath(path: string): string {
  return path
    .replaceAll("employerPackage.", "")
    .replaceAll("fiscalPayroll.", "")
    .replaceAll("household.", "")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[.[\]_]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}
