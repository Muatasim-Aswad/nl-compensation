export function rangePaths(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => rangePaths(item, `${path}[${index}]`));
  }
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (record.kind === "range" && "min" in record && "max" in record) return [path];
  return Object.entries(record).flatMap(([key, item]) =>
    rangePaths(item, path === "" ? key : `${path}.${key}`),
  );
}

export function atRangeBound<T>(value: T, bound: "min" | "max"): T {
  if (Array.isArray(value)) {
    return value.map((item) => atRangeBound(item, bound)) as T;
  }
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (record.kind === "range" && "min" in record && "max" in record) {
    return { kind: "exact", value: atRangeBound(record[bound], bound) } as T;
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, atRangeBound(item, bound)]),
  ) as T;
}
