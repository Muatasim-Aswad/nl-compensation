import { CALCULATION_API_VERSION, parseCompensationCase } from "@nl-compensation/core";
import { type StoragePaths } from "../../config/storage.js";
import {
  listCases,
  readCase,
  readProfile,
  saveCase,
  sourceObservationIds,
  writeProfile,
} from "../../infra/storage.js";
import {
  EXIT_IO,
  EXIT_OK,
  EXIT_UNSUPPORTED,
  EXIT_USAGE_OR_VALIDATION,
  json,
  option,
  readInput,
  requireOption,
  type CliIo,
} from "../../platform/cli/io.js";
import { AppError } from "../../shared/errors.js";
import {
  calculateRequest,
  listRules,
  requestFromUnknown,
  showRule,
} from "../compensation/service.js";
import { reportMarkdown } from "./markdown.js";

export async function runCompensationCommand(
  args: readonly string[],
  {
    io,
    paths,
    now,
  }: { readonly io: CliIo; readonly paths: StoragePaths; readonly now: () => string },
): Promise<number | undefined> {
  const [command, subcommand] = args;
  if (command === "calculate") {
    const raw = await readInput(requireOption(args, "--input"), io);
    const format = option(args, "--format") ?? "json";
    if (format !== "json" && format !== "markdown")
      throw new AppError("usage_error", "--format must be json or markdown");
    const request = requestFromUnknown(raw, {
      requestId: option(args, "--request-id") ?? "cli",
      calculatedAt: option(args, "--calculated-at") ?? now(),
    });
    const result = calculateRequest(request);
    if (!result.ok) {
      io.error(json(result));
      return result.errors.some((item) => item.code.startsWith("unsupported_"))
        ? EXIT_UNSUPPORTED
        : EXIT_USAGE_OR_VALIDATION;
    }
    io.out(format === "json" ? json(result) : reportMarkdown(result.report));
    return EXIT_OK;
  }
  if (command === "validate") {
    const input = parseCompensationCase(await readInput(requireOption(args, "--input"), io));
    io.out(json({ apiVersion: CALCULATION_API_VERSION, ok: true, input }));
    return EXIT_OK;
  }
  if (command === "rules" && subcommand === "list") {
    io.out(json(listRules()));
    return EXIT_OK;
  }
  if (command === "rules" && subcommand === "show") {
    io.out(json(showRule(args[2] ?? requireOption(args, "--id"))));
    return EXIT_OK;
  }
  if (command === "profile" && subcommand === "show") {
    const profile = await readProfile(paths);
    if (profile === undefined) {
      io.error(json({ ok: false, error: { code: "not_found", message: "Profile is not set" } }));
      return EXIT_IO;
    }
    io.out(json(profile));
    return EXIT_OK;
  }
  if (command === "profile" && subcommand === "set") {
    const profile = await writeProfile(
      paths,
      await readInput(requireOption(args, "--input"), io),
      now(),
    );
    io.out(json({ ok: true, profile }));
    return EXIT_OK;
  }
  if (command === "case" && subcommand === "list") {
    io.out(json({ apiVersion: CALCULATION_API_VERSION, cases: await listCases(paths) }));
    return EXIT_OK;
  }
  if (command === "case" && subcommand === "show") {
    const id = args[2] ?? requireOption(args, "--id");
    const saved = await readCase(paths, id);
    if (saved === undefined) {
      io.error(json({ ok: false, error: { code: "not_found", message: "Case was not found" } }));
      return EXIT_IO;
    }
    io.out(json(saved));
    return EXIT_OK;
  }
  if (command === "case" && subcommand === "save") {
    const raw = await readInput(requireOption(args, "--input"), io);
    const request = requestFromUnknown(raw, {
      requestId: option(args, "--request-id") ?? "case-save",
      calculatedAt: option(args, "--calculated-at") ?? now(),
    });
    const id = option(args, "--id") ?? request.input.caseId;
    if (id === undefined)
      throw new AppError("usage_error", "case save requires --id or input.caseId");
    const result = calculateRequest(request);
    if (!result.ok) {
      io.error(json(result));
      return EXIT_USAGE_OR_VALIDATION;
    }
    await saveCase(paths, id, {
      schemaVersion: "1",
      engineVersion: request.context.engineVersion,
      selectedRules: request.context.rules,
      calculatedAt: request.context.calculatedAt,
      sourceObservations: sourceObservationIds(request.input),
      input: request.input,
      report: result.report,
    });
    io.out(json({ ok: true, caseId: id, report: result.report }));
    return EXIT_OK;
  }
  return undefined;
}
