export const VALUE_KINDS = ["exact", "range", "unknown"] as const;

export type UnknownReason = "not_provided" | "not_applicable" | "not_known";

export interface ExactValue<T> {
  readonly kind: "exact";
  readonly value: T;
}

export interface RangeValue<T> {
  readonly kind: "range";
  readonly min: T;
  readonly max: T;
  /** Identifies bounds that must move together during range propagation. */
  readonly correlationId: string;
}

export interface UnknownValue {
  readonly kind: "unknown";
  readonly reason: UnknownReason;
}

export type Value<T> = ExactValue<T> | RangeValue<T> | UnknownValue;

export const exact = <T>(value: T): ExactValue<T> => ({ kind: "exact", value });

export const range = <T>(min: T, max: T, correlationId: string): RangeValue<T> => ({
  kind: "range",
  min,
  max,
  correlationId,
});

export const unknown = (reason: UnknownReason = "not_provided"): UnknownValue => ({
  kind: "unknown",
  reason,
});
