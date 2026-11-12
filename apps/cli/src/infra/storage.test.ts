import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { storagePaths, type StoragePaths } from "../config/storage.js";
import { calculateRequest, createCalculationRequest } from "../modules/compensation/service.js";
import { syntheticCase } from "../test/fixtures.js";
import {
  listCases,
  readCase,
  readCaseRecord,
  readProfile,
  readProfileRecord,
  saveCase,
  sourceObservationIds,
  writeProfile,
  type StoredCase,
} from "./storage.js";

const roots: string[] = [];
async function isolatedPaths(): Promise<StoragePaths> {
  const root = await mkdtemp(path.join(tmpdir(), "nl-compensation-storage-"));
  roots.push(root);
  return storagePaths({ HOME: path.join(root, "home"), XDG_DATA_HOME: path.join(root, "data") });
}
function inspect<T>(paths: StoragePaths, work: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(paths.database);
  try {
    return work(database);
  } finally {
    database.close();
  }
}
function savedCase(id: string): StoredCase {
  const input = syntheticCase(id);
  const request = createCalculationRequest(input, {
    requestId: "storage-test",
    calculatedAt: "2026-08-16T12:00:00Z",
  });
  const result = calculateRequest(request);
  if (!result.ok) throw new Error("Synthetic calculation failed");
  return {
    schemaVersion: "1",
    engineVersion: request.context.engineVersion,
    selectedRules: request.context.rules,
    calculatedAt: request.context.calculatedAt,
    sourceObservations: sourceObservationIds(input),
    input,
    report: result.report,
  };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SQLite persistence", () => {
  test("reading absent data creates no database or data directory", async () => {
    const paths = await isolatedPaths();
    expect(await readProfile(paths)).toBeUndefined();
    expect(await readCase(paths, "missing")).toBeUndefined();
    expect(await listCases(paths)).toEqual([]);
    await expect(access(path.dirname(paths.database))).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("a profile and its private audit metadata commit in the same owner-only database", async () => {
    const paths = await isolatedPaths();
    const profile = syntheticCase();
    await writeProfile(paths, profile, "2026-08-16T12:00:00Z");
    expect(await readProfile(paths)).toEqual(profile);
    expect((await stat(paths.database)).mode & 0o777).toBe(0o600);
    expect((await stat(path.dirname(paths.database))).mode & 0o777).toBe(0o700);
    inspect(paths, (database) => {
      expect(database.prepare("PRAGMA integrity_check").get()!.integrity_check).toBe("ok");
      expect(database.prepare("PRAGMA journal_mode").get()!.journal_mode).toBe("wal");
      expect(database.prepare("SELECT changed_at, revision FROM profile_history").all()).toEqual([
        { changed_at: "2026-08-16T12:00:00Z", revision: expect.any(String) },
      ]);
      expect(
        database
          .prepare("PRAGMA table_info(profile_history)")
          .all()
          .map((row) => row.name),
      ).not.toContain("input_json");
    });
  });

  test("a failed transaction preserves both the profile and its audit history", async () => {
    const paths = await isolatedPaths();
    await writeProfile(paths, syntheticCase("before"), "2026-08-16T12:00:00Z");
    const committed = await readProfileRecord(paths);
    await expect(
      writeProfile(paths, syntheticCase("after"), "2026-08-16T12:01:00Z", {
        beforeCommit: () => {
          throw new Error("synthetic interruption");
        },
      }),
    ).rejects.toMatchObject({ code: "storage_error" });
    expect(await readProfileRecord(paths)).toEqual(committed);
    expect(
      inspect(
        paths,
        (database) =>
          database.prepare("SELECT count(*) AS count FROM profile_history").get()!.count,
      ),
    ).toBe(1);
  });

  test("a stale writer cannot replace the current facts or append history", async () => {
    const paths = await isolatedPaths();
    await writeProfile(paths, syntheticCase("original"), "2026-08-16T12:00:00Z");
    const original = (await readProfileRecord(paths))!;
    await writeProfile(paths, syntheticCase("newer"), "2026-08-16T12:01:00Z", {
      expectedRevision: original.revision,
    });
    await expect(
      writeProfile(paths, syntheticCase("stale"), "2026-08-16T12:02:00Z", {
        expectedRevision: original.revision,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await readProfile(paths))?.caseId).toBe("newer");
    expect(
      inspect(
        paths,
        (database) =>
          database.prepare("SELECT count(*) AS count FROM profile_history").get()!.count,
      ),
    ).toBe(2);
  });

  test("retrying the same mutation is acknowledged once and reusing it with other facts conflicts", async () => {
    const paths = await isolatedPaths();
    const options = { expectedRevision: null, mutationId: "synthetic-mutation" };
    await writeProfile(paths, syntheticCase("retry"), "2026-08-16T12:00:00Z", options);
    const committed = await readProfileRecord(paths);
    await writeProfile(paths, syntheticCase("retry"), "2026-08-16T12:01:00Z", options);
    expect(await readProfileRecord(paths)).toEqual(committed);
    await expect(
      writeProfile(paths, syntheticCase("different"), "2026-08-16T12:02:00Z", options),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      inspect(
        paths,
        (database) =>
          database.prepare("SELECT count(*) AS count FROM profile_history").get()!.count,
      ),
    ).toBe(1);
    expect(
      inspect(
        paths,
        (database) => database.prepare("SELECT fingerprint FROM profiles").get()!.fingerprint,
      ),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  test("cases and reports survive reconnects and roll back together", async () => {
    const paths = await isolatedPaths();
    const original = savedCase("stored");
    await saveCase(paths, "stored", original);
    const committed = await readCaseRecord(paths, "stored");
    expect(await readCase(paths, "stored")).toEqual(original);
    expect(await listCases(paths)).toEqual(["stored"]);
    await expect(
      saveCase(paths, "stored", savedCase("replacement"), {
        beforeCommit: () => {
          throw new Error("synthetic failure");
        },
      }),
    ).rejects.toMatchObject({ code: "storage_error" });
    expect(await readCaseRecord(paths, "stored")).toEqual(committed);
    expect(
      inspect(paths, (database) => database.prepare("PRAGMA foreign_key_check").all()),
    ).toEqual([]);
  });

  test("JSON files and incompatible SQLite schemas are rejected without conversion", async () => {
    const paths = await isolatedPaths();
    await mkdir(path.dirname(paths.database), { recursive: true });
    const raw = JSON.stringify(syntheticCase("unsupported"));
    await writeFile(paths.database, raw);
    await expect(readProfile(paths)).rejects.toMatchObject({ code: "storage_error" });
    await expect(
      writeProfile(paths, syntheticCase(), "2026-08-16T12:00:00Z"),
    ).rejects.toMatchObject({ code: "storage_error" });
    expect(await readFile(paths.database, "utf8")).toBe(raw);
    await rm(paths.database);
    inspect(paths, (database) => database.exec("PRAGMA user_version = 99"));
    await expect(readProfile(paths)).rejects.toMatchObject({ code: "storage_error" });
    await expect(
      writeProfile(paths, syntheticCase(), "2026-08-16T12:00:00Z"),
    ).rejects.toMatchObject({ code: "storage_error" });
    expect(
      inspect(paths, (database) => database.prepare("PRAGMA user_version").get()!.user_version),
    ).toBe(99);
  });

  test("SQLite constraints enforce record identity and report ownership", async () => {
    const paths = await isolatedPaths();
    await saveCase(paths, "valid", savedCase("valid"));
    inspect(paths, (database) => {
      database.exec("PRAGMA foreign_keys = ON");
      expect(() =>
        database
          .prepare("INSERT INTO cases (id, revision, input_json) VALUES (?, ?, ?)")
          .run("../invalid", "synthetic", JSON.stringify(syntheticCase())),
      ).toThrow();
      expect(() =>
        database
          .prepare("UPDATE reports SET case_id = ? WHERE case_id = ?")
          .run("missing", "valid"),
      ).toThrow();
    });
  });

  test("profile audit history is bounded without retaining earlier private facts", async () => {
    const paths = await isolatedPaths();
    for (let index = 0; index < 102; index += 1)
      await writeProfile(paths, syntheticCase(`synthetic-${index}`), "2026-08-16T12:00:00Z");
    expect(
      inspect(
        paths,
        (database) =>
          database.prepare("SELECT count(*) AS count FROM profile_history").get()!.count,
      ),
    ).toBe(100);
    expect((await readProfile(paths))?.caseId).toBe("synthetic-101");
  });

  test("revision checks remain atomic against a writer in another process", async () => {
    const paths = await isolatedPaths();
    await writeProfile(paths, syntheticCase("initial"), "2026-08-16T12:00:00Z");
    const before = (await readProfileRecord(paths))!;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { DatabaseSync } from 'node:sqlite';
      const database = new DatabaseSync(process.argv[1]);
      database.exec('BEGIN IMMEDIATE');
      const input = JSON.parse(database.prepare('SELECT input_json FROM profiles').get().input_json);
      input.caseId = 'other-process';
      database.prepare('UPDATE profiles SET revision = ?, input_json = ?').run('synthetic-child-revision', JSON.stringify(input));
      database.prepare('INSERT INTO profile_history (profile_id, changed_at, revision) VALUES (?, ?, ?)').run('default', '2026-08-16T12:01:00Z', 'synthetic-child-revision');
      process.stdout.write('locked');
      setTimeout(() => { database.exec('COMMIT'); database.close(); }, 300);
    `,
        paths.database,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const finished = once(child, "exit");
    try {
      await once(child.stdout!, "data");
      await expect(
        writeProfile(paths, syntheticCase("stale-process"), "2026-08-16T12:02:00Z", {
          expectedRevision: before.revision,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      expect((await readProfile(paths))?.caseId).toBe("other-process");
      expect((await finished)[0]).toBe(0);
    } finally {
      if (child.exitCode === null) child.kill();
    }
  });
});
