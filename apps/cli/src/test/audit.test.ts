import { DatabaseSync } from "node:sqlite";
import {
  eur,
  rational,
  type CompensationCaseInput,
  type Money,
  type Value,
} from "@nl-compensation/core";
import { syntheticExplicitFact } from "@nl-compensation/core/testing";
import { canonicalize, contentHashOf, sha256Hex } from "@nl-compensation/rules-nl";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { storagePaths } from "../config/storage.js";
import { runCli } from "../entrypoints/cli.js";
import { startService } from "../entrypoints/server.js";
import {
  readCase,
  readProfile,
  saveCase,
  sourceObservationIds,
  writeProfile,
  type StoredCase,
} from "../infra/storage.js";
import {
  calculateCompensation,
  createCalculationRequest,
} from "../modules/compensation/service.js";
import { syntheticCase } from "./fixtures.js";

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }),
  );
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function isolatedEnvironment(root: string) {
  return {
    HOME: path.join(root, "home"),
    XDG_DATA_HOME: path.join(root, "data"),
  };
}

function report(input: CompensationCaseInput) {
  const envelope = createCalculationRequest(input, {
    requestId: "audit",
    calculatedAt: "2026-08-16T12:00:00.000Z",
  });
  return calculateCompensation(envelope.input, envelope.context);
}

const exactCents = (value: Value<Money>): number => {
  if (value.kind !== "exact") throw new Error(`expected an exact value, received ${value.kind}`);
  return value.value.amountCents;
};

function householdCase(overrides: Record<string, unknown>): CompensationCaseInput {
  const base = syntheticCase();
  return {
    ...base,
    household: { ...base.household, ...overrides },
    firstYear: undefined,
  } as CompensationCaseInput;
}

describe("audit: household classification is never guessed", () => {
  test("an under-21 applicant with an adult partner is not a jongerenhuishouden", () => {
    // Deriving the youth household from the applicant's age alone capped the
    // rekenhuur at the under-21 huurgrens and dropped parts B and C, which
    // understated this household by more than EUR 2.000 a year.
    const withAdultPartner = report(
      householdCase({
        hasBenefitPartner: syntheticExplicitFact(true),
        partnerAnnualIncome: syntheticExplicitFact(eur(0)),
        partnerInsuredForDutchHealthcare: syntheticExplicitFact(true),
        partnerAssets: syntheticExplicitFact(eur(0)),
        householdMembers: syntheticExplicitFact(rational(2, 1)),
        applicantAge: syntheticExplicitFact(rational(20, 1)),
        partnerAge: syntheticExplicitFact(rational(35, 1)),
        kaleRentMonthly: syntheticExplicitFact(eur(80_000)),
        householdAnnualIncome: syntheticExplicitFact(eur(2_000_000)),
      }),
    );
    // Rekenhuur EUR 800: A 297,49 + B (713,02 - 498,20) x 65% + C (800 - 713,02) x 40%.
    expect(exactCents(withAdultPartner.household.steadyState.huurtoeslagAnnual)).toBe(565_200);
  });

  test("an unknown partner age leaves huurtoeslag unavailable instead of assuming one", () => {
    const unknownPartnerAge = report(
      householdCase({
        hasBenefitPartner: syntheticExplicitFact(true),
        partnerAnnualIncome: syntheticExplicitFact(eur(0)),
        partnerInsuredForDutchHealthcare: syntheticExplicitFact(true),
        partnerAssets: syntheticExplicitFact(eur(0)),
        householdMembers: syntheticExplicitFact(rational(2, 1)),
        applicantAge: syntheticExplicitFact(rational(20, 1)),
        kaleRentMonthly: syntheticExplicitFact(eur(80_000)),
        householdAnnualIncome: syntheticExplicitFact(eur(2_000_000)),
      }),
    );
    expect(unknownPartnerAge.household.steadyState.huurtoeslagAnnual.kind).toBe("unknown");
    const household = unknownPartnerAge.completeness.find((item) => item.layer === "household");
    expect(household?.missingInputs).toContain("household.partnerAge");
  });

  test("a co-resident household without a declared joint income reports the gap", () => {
    const withCoResident = report(
      householdCase({
        householdMembers: syntheticExplicitFact(rational(3, 1)),
        applicantAge: syntheticExplicitFact(rational(40, 1)),
        householdAnnualIncome: undefined,
      }),
    );
    expect(withCoResident.household.steadyState.huurtoeslagAnnual.kind).toBe("unknown");
    const household = withCoResident.completeness.find((item) => item.layer === "household");
    expect(household?.missingInputs).toContain("household.householdAnnualIncome");
  });

  test("a declared joint income is not added to the partner income a second time", () => {
    const joint = report(
      householdCase({
        hasBenefitPartner: syntheticExplicitFact(true),
        partnerAnnualIncome: syntheticExplicitFact(eur(1_000_000)),
        partnerInsuredForDutchHealthcare: syntheticExplicitFact(true),
        partnerAssets: syntheticExplicitFact(eur(0)),
        householdMembers: syntheticExplicitFact(rational(2, 1)),
        applicantAge: syntheticExplicitFact(rational(40, 1)),
        partnerAge: syntheticExplicitFact(rational(38, 1)),
        householdAnnualIncome: syntheticExplicitFact(eur(3_000_000)),
      }),
    );
    expect(exactCents(joint.household.steadyState.toetsingsinkomen)).toBe(3_000_000);
    // 4,289% x 29.736 + 13,73% x 264 = 1.311,62 normpremie; 4.238 - 1.311,62.
    expect(exactCents(joint.household.steadyState.zorgtoeslagAnnual)).toBe(292_638);
    expect(joint.assumptions.some((item) => item.code === "household_joint_income_declared")).toBe(
      true,
    );
  });
});

describe("audit: withholding streams partition the year", () => {
  test("the separately paid holiday allowance is not withheld twice", () => {
    const baseline = report(syntheticCase());
    const settlement = exactCents(baseline.fiscalPayroll.possibleSettlement);
    const special = exactCents(baseline.fiscalPayroll.specialPaymentWithholding);
    expect(special).toBeGreaterThan(0);
    // Before this audit the settlement was exactly the special withholding,
    // because the regular estimate already spread the tax on that payment.
    expect(settlement).not.toBe(special);
    expect(Math.abs(settlement)).toBeLessThan(50_000);
  });

  test("regular withholding uses the bundled monthly wage table", () => {
    const baseline = report(syntheticCase());
    expect(baseline.fiscalPayroll.precision).toBe("estimated");
    expect(exactCents(baseline.fiscalPayroll.payrollWithholdingRegular)).toBe(104_575);
    expect(baseline.limitations.map((item) => item.code)).not.toContain(
      "nl_payroll_period_table_not_bundled",
    );
  });

  test("normal and annual net views keep payslip adjustments explicit", () => {
    const baseline = report(syntheticCase());
    expect(baseline.fiscalPayroll.regularPayPeriod).toBe("monthly");
    expect(exactCents(baseline.fiscalPayroll.normalPeriodGross)).toBe(460_000);
    expect(exactCents(baseline.fiscalPayroll.normalPeriodPreTaxDeduction)).toBe(15_000);
    expect(exactCents(baseline.fiscalPayroll.normalPeriodNetSalary)).toBe(340_425);
    expect(exactCents(baseline.fiscalPayroll.normalPeriodNetToBank)).toBe(340_425);

    const baseInput = syntheticCase();
    const adjusted = report({
      ...baseInput,
      fiscal: {
        ...baseInput.fiscal,
        postTaxEmployeeDeductionsPerPeriod: syntheticExplicitFact(eur(5_000)),
        netReimbursementsPerPeriod: syntheticExplicitFact(eur(7_500)),
      },
    });
    expect(exactCents(adjusted.fiscalPayroll.normalPeriodNetSalary)).toBe(335_425);
    expect(exactCents(adjusted.fiscalPayroll.normalPeriodNetToBank)).toBe(342_925);
    expect(exactCents(adjusted.fiscalPayroll.annualNetThroughPayroll)).toBe(
      exactCents(baseline.fiscalPayroll.annualNetThroughPayroll) - 60_000,
    );
    expect(exactCents(adjusted.fiscalPayroll.annualNetAfterSettlement)).toBe(
      exactCents(baseline.fiscalPayroll.annualNetAfterSettlement) - 60_000,
    );
    expect(adjusted.fiscalPayroll.specialPayments).toHaveLength(1);
    expect(exactCents(adjusted.fiscalPayroll.specialPayments[0]!.estimatedPeriodNetToBank)).toBe(
      exactCents(baseline.fiscalPayroll.specialPayments[0]!.estimatedPeriodNetToBank) + 2_500,
    );
  });

  test("an unusable first-year start date produces no first-year view", () => {
    const base = syntheticCase();
    const broken = report({
      ...base,
      firstYear: {
        calendarYear: 2026,
        jobStartDate: syntheticExplicitFact("not-a-date"),
        incomeBeforeStart: syntheticExplicitFact(eur(2_000_000)),
      },
    });
    expect(broken.household.firstCalendarYear).toBeUndefined();
    expect(broken.limitations.map((item) => item.code)).toContain("first_year_start_date_unusable");
    const outsideYear = report({
      ...base,
      firstYear: {
        calendarYear: 2026,
        jobStartDate: syntheticExplicitFact("2027-03-01"),
        incomeBeforeStart: syntheticExplicitFact(eur(2_000_000)),
      },
    });
    expect(outsideYear.household.firstCalendarYear).toBeUndefined();
    // A usable date still produces the view.
    expect(report(base).household.firstCalendarYear).toBeDefined();
  });

  test("a taxable non-cash benefit raises first-year tax without becoming spendable cash", () => {
    const base = syntheticCase();
    const withoutBenefit = report(base);
    const withBenefit = report({
      ...base,
      fiscal: {
        ...base.fiscal,
        taxableBenefitAnnual: syntheticExplicitFact(eur(1_200_000)),
      },
    });
    const withoutSpendable = exactCents(
      withoutBenefit.household.firstCalendarYear!.spendableIncomeAnnual,
    );
    const withSpendable = exactCents(
      withBenefit.household.firstCalendarYear!.spendableIncomeAnnual,
    );
    expect(withSpendable).toBeLessThan(withoutSpendable);
  });

  test("other annual income is fixed at zero in the supported scope", () => {
    const base = syntheticCase();
    expect(() =>
      report({
        ...base,
        fiscal: {
          ...base.fiscal,
          otherAnnualIncome: syntheticExplicitFact(eur(1)),
        },
      }),
    ).toThrow(/otherAnnualIncome is fixed at EUR 0/);
  });
});

describe("audit: private storage survives interference", () => {
  test("concurrent profile writes reject conflicts and retain an atomic parseable record", async () => {
    const environment = isolatedEnvironment(await temporaryRoot("nl-compensation-audit-store-"));
    const paths = storagePaths(environment);
    const first = syntheticCase("concurrent-a");
    const second = syntheticCase("concurrent-b");
    const outcomes = await Promise.allSettled([
      writeProfile(paths, first, "2026-08-16T12:00:00.000Z"),
      writeProfile(paths, second, "2026-08-16T12:00:01.000Z"),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      reason: { code: "conflict" },
    });
    const stored = await readProfile(paths);
    expect(["concurrent-a", "concurrent-b"]).toContain(stored?.caseId);
    const database = new DatabaseSync(paths.database, { readOnly: true });
    try {
      expect(database.prepare("SELECT count(*) AS count FROM profile_history").get()!.count).toBe(
        1,
      );
    } finally {
      database.close();
    }
  });

  test("an invalid case never replaces the committed database record", async () => {
    const environment = isolatedEnvironment(await temporaryRoot("nl-compensation-audit-case-"));
    const paths = storagePaths(environment);
    const input = syntheticCase("audit-case");
    const envelope = createCalculationRequest(input, {
      requestId: "audit",
      calculatedAt: "2026-08-16T12:00:00.000Z",
    });
    const stored: StoredCase = {
      schemaVersion: "1",
      engineVersion: envelope.context.engineVersion,
      selectedRules: envelope.context.rules,
      calculatedAt: envelope.context.calculatedAt,
      sourceObservations: sourceObservationIds(input),
      input,
      report: calculateCompensation(envelope.input, envelope.context),
    };
    await saveCase(paths, "audit-case", stored);
    const valid = await readCase(paths, "audit-case");
    await expect(
      saveCase(paths, "audit-case", { ...stored, engineVersion: "" } as StoredCase),
    ).rejects.toThrow();
    expect(await readCase(paths, "audit-case")).toEqual(valid);
    await writeFile(paths.database, "{ truncated", "utf8");
    const status = await runCli(["case", "show", "--id", "audit-case"], {
      environment,
      io: { out: () => undefined, error: () => undefined, readStdin: async () => "" },
    });
    expect(status).not.toBe(0);
  });

  test("a traversal case ID is rejected before it reaches the filesystem", async () => {
    const environment = isolatedEnvironment(await temporaryRoot("nl-compensation-audit-id-"));
    for (const id of ["../escape", "a/b", "", ".hidden"]) {
      const status = await runCli(["case", "show", "--id", id], {
        environment,
        io: { out: () => undefined, error: () => undefined, readStdin: async () => "" },
      });
      expect(status).not.toBe(0);
    }
  });
});

describe("audit: the local service refuses everything it should", () => {
  test("rejects sandboxed origins, encoded traversal, and caches nothing private", async () => {
    const environment = isolatedEnvironment(await temporaryRoot("nl-compensation-audit-http-"));
    const service = await startService({
      port: 0,
      environment,
      now: () => "2026-08-16T12:00:00.000Z",
    });
    try {
      const base = service.url;
      const nullOrigin = await fetch(`${base}/api/v1`, { headers: { Origin: "null" } });
      expect(nullOrigin.status).toBe(403);

      const foreignOrigin = await fetch(`${base}/api/v1`, {
        headers: { Origin: "http://attacker.example" },
      });
      expect(foreignOrigin.status).toBe(403);

      const httpsOrigin = await fetch(`${base}/api/v1`, {
        headers: { Origin: `https://127.0.0.1:${service.port}` },
      });
      expect(httpsOrigin.status).toBe(403);

      // `fetch` refuses to override Host, so a rebinding probe needs a raw client.
      const rawStatus = async (host: string): Promise<number | undefined> =>
        new Promise((resolve, reject) => {
          const probe = httpRequest(
            { host: "127.0.0.1", port: service.port, path: "/api/v1", headers: { Host: host } },
            (response) => {
              response.resume();
              response.once("end", () => resolve(response.statusCode));
            },
          );
          probe.once("error", reject);
          probe.end();
        });
      expect(await rawStatus("compensation.example")).toBe(400);
      expect(await rawStatus("127.0.0.1.nip.io")).toBe(400);
      expect(await rawStatus(`127.0.0.1:${service.port}`)).toBe(200);

      for (const attempt of [
        "/%2e%2e/%2e%2e/etc/passwd",
        "/..%2fpackage.json",
        "/a/../../secret",
      ]) {
        const traversal = await fetch(`${base}${attempt}`);
        expect([400, 404]).toContain(traversal.status);
      }

      const preflight = await fetch(`${base}/api/v1/profile`, { method: "OPTIONS" });
      expect(preflight.status).toBe(405);

      const unauthenticatedWrite = await fetch(`${base}/api/v1/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syntheticCase()),
      });
      expect(unauthenticatedWrite.status).toBe(403);

      const wrongToken = await fetch(`${base}/api/v1/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-NL-Compensation-Token": `${service.token}x`,
        },
        body: JSON.stringify(syntheticCase()),
      });
      expect(wrongToken.status).toBe(403);

      const index = await fetch(`${base}/`);
      if (index.status === 200) {
        // The entry document embeds the write-session token, so it is private.
        expect(index.headers.get("cache-control")).toBe("no-store");
        expect(await index.text()).toContain("nl-compensation-token");
      }
      expect(service.url.startsWith("http://127.0.0.1:")).toBe(true);
    } finally {
      await service.close();
    }
  });
});

describe("audit: the tracker adapter refuses to guess", () => {
  async function stubTracker(handler: (method: string, url: string) => [number, string]) {
    const requests: string[] = [];
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) void _chunk;
      requests.push(`${request.method ?? ""} ${request.url ?? ""}`);
      const [status, body] = handler(request.method ?? "", request.url ?? "");
      response.statusCode = status;
      response.setHeader("Content-Type", "application/json");
      response.end(body);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("stub did not bind");
    return { url: `http://127.0.0.1:${address.port}`, requests };
  }

  async function trackerRuntime() {
    const environment = isolatedEnvironment(await temporaryRoot("nl-compensation-audit-track-"));
    const input = syntheticCase("audit-track-case");
    const envelope = createCalculationRequest(input, {
      requestId: "audit",
      calculatedAt: "2026-08-16T12:00:00.000Z",
    });
    await saveCase(storagePaths(environment), "audit-track-case", {
      schemaVersion: "1",
      engineVersion: envelope.context.engineVersion,
      selectedRules: envelope.context.rules,
      calculatedAt: envelope.context.calculatedAt,
      sourceObservations: sourceObservationIds(input),
      input,
      report: calculateCompensation(envelope.input, envelope.context),
    });
    return environment;
  }

  const attach = async (
    environment: ReturnType<typeof isolatedEnvironment>,
    url: string,
    extra: readonly string[] = [],
    confirm?: () => Promise<boolean>,
  ) => {
    const errors: string[] = [];
    const output: string[] = [];
    const status = await runCli(
      [
        "tracker",
        "attach",
        "--job-id",
        "job-audit",
        "--case-id",
        "audit-track-case",
        "--tracker-url",
        url,
        ...extra,
      ],
      {
        environment,
        io: {
          out: (text) => output.push(text),
          error: (text) => errors.push(text),
          readStdin: async () => "",
          ...(confirm === undefined ? {} : { confirm }),
        },
      },
    );
    return { status, errors: errors.join(""), output: output.join("") };
  };

  test("a refused confirmation sends no write", async () => {
    const environment = await trackerRuntime();
    const tracker = await stubTracker(() => [
      200,
      JSON.stringify({ id: "job-audit", updated_at: "2026-08-16T12:00:00Z", meta: { keep: 1 } }),
    ]);
    const result = await attach(environment, tracker.url, ["--apply"], async () => false);
    expect(result.status).toBe(2);
    expect(result.errors).toContain("confirmation_required");
    expect(tracker.requests.some((entry) => entry.startsWith("PATCH"))).toBe(false);
  });

  test("a non-interactive apply refuses instead of defaulting to yes", async () => {
    const environment = await trackerRuntime();
    const tracker = await stubTracker(() => [
      200,
      JSON.stringify({ id: "job-audit", updated_at: "2026-08-16T12:00:00Z", meta: {} }),
    ]);
    const result = await attach(environment, tracker.url, ["--apply"]);
    expect(result.status).toBe(2);
    expect(tracker.requests.some((entry) => entry.startsWith("PATCH"))).toBe(false);
  });

  test("a tracker that is not running fails without touching the saved case", async () => {
    const environment = await trackerRuntime();
    const result = await attach(environment, "http://127.0.0.1:1");
    expect(result.status).not.toBe(0);
    expect(result.output).toBe("");
  });

  test("a tracker error and a shape mismatch both stop the attach", async () => {
    const environment = await trackerRuntime();
    const failing = await stubTracker(() => [500, '{"detail":"boom"}']);
    const errored = await attach(environment, failing.url);
    expect(errored.status).not.toBe(0);
    expect(errored.errors).toContain("500");

    const wrongShape = await stubTracker(() => [200, '{"id":"job-audit","meta":{}}']);
    const mismatched = await attach(environment, wrongShape.url);
    expect(mismatched.status).not.toBe(0);
    expect(mismatched.errors).toContain("shape mismatch");
  });

  test("a non-loopback tracker URL is refused before any request", async () => {
    const environment = await trackerRuntime();
    const remote = await attach(environment, "http://tracker.example");
    expect(remote.status).not.toBe(0);
    expect(remote.errors).toContain("loopback");
  });
});

describe("audit: the bundled digest matches the platform digest", () => {
  test("sha256Hex agrees with node:crypto for every length up to three blocks", () => {
    // `packages/rules-nl` implements SHA-256 itself so the browser bundle and
    // the CLI produce identical rule hashes. Only this workspace has the Node
    // types to compare that implementation against the platform one.
    for (let length = 0; length <= 200; length += 1) {
      const message = "a".repeat(length);
      expect(sha256Hex(message)).toBe(createHash("sha256").update(message, "utf8").digest("hex"));
    }
  });

  test("a rule content hash is reproducible from its canonical encoding", () => {
    const canonical = canonicalize({ b: 1, a: [2, 3], c: null });
    expect(contentHashOf({ c: null, a: [2, 3], b: 1 })).toBe(
      `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
    );
  });
});
