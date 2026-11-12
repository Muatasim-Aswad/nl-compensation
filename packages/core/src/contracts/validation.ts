export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export class ContractValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

export type Parser<T> = (input: unknown, path?: string) => T;

export function record(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ContractValidationError([{ path, code: "type", message: "expected an object" }]);
  }
  return input as Record<string, unknown>;
}

export function string(input: unknown, path: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new ContractValidationError([
      { path, code: "type", message: "expected a non-empty string" },
    ]);
  }
  return input;
}

export function boolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw new ContractValidationError([{ path, code: "type", message: "expected a boolean" }]);
  }
  return input;
}

export function integer(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input)) {
    throw new ContractValidationError([
      { path, code: "integer", message: "expected a safe integer" },
    ]);
  }
  return input;
}

export function enumeration<const T extends readonly string[]>(
  input: unknown,
  values: T,
  path: string,
): T[number] {
  if (typeof input !== "string" || !values.includes(input)) {
    throw new ContractValidationError([
      { path, code: "enum", message: `expected one of ${values.join(", ")}` },
    ]);
  }
  return input as T[number];
}

export function array<T>(input: unknown, parser: Parser<T>, path: string): readonly T[] {
  if (!Array.isArray(input)) {
    throw new ContractValidationError([{ path, code: "type", message: "expected an array" }]);
  }
  return input.map((item, index) => parser(item, `${path}[${index}]`));
}

export function optional<T>(input: unknown, parser: Parser<T>, path: string): T | undefined {
  return input === undefined ? undefined : parser(input, path);
}
