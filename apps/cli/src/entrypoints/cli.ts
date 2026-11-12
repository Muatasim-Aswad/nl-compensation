#!/usr/bin/env node
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { storagePaths } from "../config/storage.js";
import { runCompensationCommand } from "../modules/compensation/cli.js";
import { runTrackerCommand } from "../modules/tracker/cli.js";
import {
  defaultIo,
  errorExit,
  EXIT_OK,
  EXIT_USAGE_OR_VALIDATION,
  json,
  option,
  type CliRuntime,
} from "../platform/cli/io.js";
import { AppError } from "../shared/errors.js";
import { startService } from "./server.js";

export { reportMarkdown } from "../modules/compensation/markdown.js";
export {
  EXIT_IO,
  EXIT_OK,
  EXIT_UNSUPPORTED,
  EXIT_USAGE_OR_VALIDATION,
} from "../platform/cli/io.js";

export async function runCli(args: readonly string[], runtime: CliRuntime = {}): Promise<number> {
  const io = runtime.io ?? defaultIo;
  const now = runtime.now ?? (() => new Date().toISOString());
  const [command] = args;
  try {
    const paths = storagePaths(runtime.environment);
    const dependencies = { io, now, paths };
    const result =
      (await runCompensationCommand(args, dependencies)) ??
      (await runTrackerCommand(args, dependencies));
    if (result !== undefined) return result;
    if (command === "serve") {
      const portText = option(args, "--port");
      const port = portText === undefined ? 3466 : Number(portText);
      if (!Number.isInteger(port) || port < 0 || port > 65_535)
        throw new AppError("usage_error", "--port must be an integer from 0 to 65535");
      const service = await startService({
        port,
        token: option(args, "--token"),
        log: (entry) => io.error(json(entry)),
        paths,
        now,
      });
      io.error(json({ event: "listening", url: service.url, token: service.token }));
      const stop = async (): Promise<void> => service.close();
      process.once("SIGINT", () => void stop());
      process.once("SIGTERM", () => void stop());
      await new Promise<void>((resolve) => service.server.once("close", resolve));
      return EXIT_OK;
    }
    io.out(
      "Usage: nl-compensation <calculate|validate|rules list|rules show|profile show|profile set|case list|case show|case save|tracker attach|serve>\n",
    );
    return command === undefined || command === "help" || command === "--help"
      ? EXIT_OK
      : EXIT_USAGE_OR_VALIDATION;
  } catch (error) {
    return errorExit(error, io);
  }
}
if (process.argv[1] !== undefined) {
  const entryUrl = pathToFileURL(await realpath(process.argv[1])).href;
  if (import.meta.url === entryUrl) process.exitCode = await runCli(process.argv.slice(2));
}
