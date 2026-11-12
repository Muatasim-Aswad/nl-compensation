import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { syntheticCase } from "../test/fixtures.js";
import { runCli } from "./cli.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agent-facing CLI", () => {
  test("calculate from stdin is JSON-stable and performs no XDG writes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nl-compensation-cli-"));
    roots.push(root);
    const output: string[] = [];
    const errors: string[] = [];
    const environment = {
      HOME: path.join(root, "home"),
      XDG_DATA_HOME: path.join(root, "data"),
    };
    const status = await runCli(
      [
        "calculate",
        "--input",
        "-",
        "--format",
        "json",
        "--calculated-at",
        "2026-08-16T12:00:00.000Z",
      ],
      {
        environment,
        io: {
          out: (text) => output.push(text),
          error: (text) => errors.push(text),
          readStdin: async () => JSON.stringify(syntheticCase()),
        },
      },
    );
    expect(status).toBe(0);
    expect(errors).toEqual([]);
    expect(JSON.parse(output.join("")) as unknown).toMatchObject({
      apiVersion: "v1",
      requestId: "cli",
      ok: true,
    });
    await expect(access(environment.XDG_DATA_HOME)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("validation failures use the documented stable exit code", async () => {
    const errors: string[] = [];
    const status = await runCli(["validate", "--input", "-"], {
      io: {
        out: () => undefined,
        error: (text) => errors.push(text),
        readStdin: async () => JSON.stringify({ schemaVersion: "2" }),
      },
    });
    expect(status).toBe(2);
    expect(JSON.parse(errors.join("")) as unknown).toMatchObject({
      error: { code: "validation_error" },
    });
  });
});
