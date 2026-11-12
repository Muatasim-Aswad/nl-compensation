import { ContractValidationError, httpSchemas, type ValidationIssue } from "@nl-compensation/core";
import { Ajv, type ValidateFunction } from "ajv";
import { AppError } from "../../shared/errors.js";

export type ContractName = keyof typeof httpSchemas;
const ajv = new Ajv({ strict: false, allErrors: true });
const validators = new Map<ContractName, ValidateFunction>();

export function validateHttpContract(name: ContractName, raw: unknown, response = false): void {
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.compile(httpSchemas[name]);
    validators.set(name, validate);
  }
  // Optional TypeScript properties disappear on the wire; validate that exact JSON shape.
  if (validate(JSON.parse(JSON.stringify(raw)))) return;
  if (response) throw new AppError("internal_error", "The service produced an invalid response.");
  const issues: ValidationIssue[] = (validate.errors ?? []).map((error) => ({
    path: error.instancePath || "request",
    code: error.keyword,
    message: error.message ?? "Invalid value",
  }));
  throw new ContractValidationError(issues);
}
