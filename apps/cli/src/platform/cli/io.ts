import { readFile } from "node:fs/promises";
import { stderr, stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { type StorageEnvironment } from "../../config/storage.js";
import { AppError, publicError, systemErrorCode } from "../../shared/errors.js";

export interface CliIo {
  readonly out: (text: string) => void;
  readonly error: (text: string) => void;
  readonly readStdin: () => Promise<string>;
  readonly confirm?: (prompt: string) => Promise<boolean>;
}

export interface CliRuntime {
  readonly environment?: StorageEnvironment;
  readonly now?: () => string;
  readonly io?: CliIo;
}

export const defaultIo: CliIo = {
  out: (text) => stdout.write(text),
  error: (text) => stderr.write(text),
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  },
  confirm: async (prompt) => {
    if (!stdin.isTTY || !stdout.isTTY) return false;
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      return (await terminal.question(`${prompt} [y/N] `)).trim().toLowerCase() === "y";
    } finally {
      terminal.close();
    }
  },
};

export function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new AppError("usage_error", `${name} requires a value`);
  return value;
}

export function requireOption(args: readonly string[], name: string): string {
  const value = option(args, name);
  if (value === undefined) throw new AppError("usage_error", `${name} is required`);
  return value;
}

export async function readInput(source: string, io: CliIo): Promise<unknown> {
  const content = source === "-" ? await io.readStdin() : await readFile(source, "utf8");
  return JSON.parse(content) as unknown;
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function errorExit(error: unknown, io: CliIo): number {
  const systemCode = error instanceof AppError ? undefined : systemErrorCode(error);
  const failure = systemCode
    ? new AppError("storage_error", "Local data could not be accessed.", undefined, {
        cause: error,
      })
    : error;
  const safe = publicError(failure);
  io.error(json({ ok: false, error: safe }));
  return ["storage_error", "internal_error", "not_found", "tracker_error"].includes(safe.code)
    ? EXIT_IO
    : EXIT_USAGE_OR_VALIDATION;
}

export const EXIT_OK = 0;

export const EXIT_USAGE_OR_VALIDATION = 2;

export const EXIT_IO = 3;

export const EXIT_UNSUPPORTED = 4;
