import { readTrackerJob } from "../../infra/tracker.js";
import { type StoragePaths } from "../../config/storage.js";
import { readCase } from "../../infra/storage.js";
import {
  EXIT_IO,
  EXIT_OK,
  EXIT_USAGE_OR_VALIDATION,
  json,
  option,
  requireOption,
  type CliIo,
} from "../../platform/cli/io.js";
import { applyTrackerPlan, prepareTrackerPlan } from "../tracker/service.js";

export async function runTrackerCommand(
  args: readonly string[],
  { io, paths }: { readonly io: CliIo; readonly paths: StoragePaths; readonly now: () => string },
): Promise<number | undefined> {
  const [command, subcommand] = args;
  if (command === "tracker" && subcommand === "attach") {
    const jobId = requireOption(args, "--job-id");
    const caseId = requireOption(args, "--case-id");
    const stored = await readCase(paths, caseId);
    if (stored === undefined) {
      io.error(json({ ok: false, error: { code: "not_found", message: "Case was not found" } }));
      return EXIT_IO;
    }
    const trackerUrl = option(args, "--tracker-url") ?? "http://127.0.0.1:3456";
    const plan = prepareTrackerPlan(await readTrackerJob(trackerUrl, jobId), caseId, stored);
    if (!args.includes("--apply")) {
      io.out(json({ ok: true, mode: "dry-run", ...plan }));
      return EXIT_OK;
    }
    const confirmed = await io.confirm?.(
      `Attach the compact compensation summary to Job Tracker job ${jobId}?`,
    );
    if (confirmed !== true) {
      io.error(
        json({
          ok: false,
          error: { code: "confirmation_required", message: "No update was sent" },
        }),
      );
      return EXIT_USAGE_OR_VALIDATION;
    }
    const updated = await applyTrackerPlan(trackerUrl, plan);
    io.out(json({ ok: true, mode: "applied", jobId: updated.id, updatedAt: updated.updatedAt }));
    return EXIT_OK;
  }
  return undefined;
}
