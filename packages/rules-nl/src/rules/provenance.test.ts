import { parseRuleDefinition, parseRuleSelection } from "@nl-compensation/core";
import { describe, expect, test } from "vite-plus/test";
import { ALL_SOURCES } from "../provenance/sources.js";
import { contentHashOf } from "../support/hash.js";
import { BUNDLE_2026, BUNDLE_2026_ID, findRuleById, ruleSelectionFor } from "./bundle.js";
import { defineRule } from "./define.js";

const RULES = [
  BUNDLE_2026.employment,
  BUNDLE_2026.incomeTax,
  BUNDLE_2026.payroll,
  BUNDLE_2026.zorgtoeslag,
  BUNDLE_2026.huurtoeslag,
  BUNDLE_2026.reimbursements,
];

/**
 * Pinned digests. A changed constant, bound, or source changes the digest, and
 * this test then fails until a new rule ID is minted. That is what makes the
 * modules immutable in practice rather than only by convention.
 */
const PINNED_HASHES: Readonly<Record<string, string>> = {
  "nl-employment-2026-r2":
    "sha256:ce11be526721b1c9f3c35f622e9d806e90c0ab3d6bfb044cb250a9748b2d0a00",
  "nl-income-tax-2026-r2":
    "sha256:bb12e28f967225605a84ea5e95334219631edb3bc120bbe0e69a03886b3074f3",
  "nl-payroll-2026-r3": "sha256:06ebb1e54d9df0f0546e86aa9323d062a4a7cd0c2fbd74347bb675da95577fdd",
  "nl-zorgtoeslag-2026-r2":
    "sha256:5b20acacce5bc9212cf89cc0c1da08428e5cb6851285e997b63ce8fc9eceb14c",
  "nl-huurtoeslag-2026-r2":
    "sha256:fc241a961aece5b95812f89727af1b3b98dc61d638ce11c7098d368ead1e2a98",
  "nl-reimbursements-2026-r2":
    "sha256:a69010a4c84815c9ee0886b9adbd675d80fa6bec80796056eb4a1db8b44d9a45",
};

const PINNED_BUNDLE_HASH =
  "sha256:b6a3d0bfb1e143481930729b821ae88c3854cd33a466db11a2c450c1844a0e12";

describe("rule identity and provenance", () => {
  test("every rule keeps its pinned content hash", () => {
    for (const rule of RULES) {
      expect(rule.contentHash).toBe(PINNED_HASHES[rule.id]);
    }
    expect(Object.keys(PINNED_HASHES)).toHaveLength(RULES.length);
  });

  test("the bundle hash covers exactly the selected revisions", () => {
    expect(BUNDLE_2026.contentHash).toBe(PINNED_BUNDLE_HASH);
    expect(BUNDLE_2026.id).toBe(BUNDLE_2026_ID);
  });

  test("separate immutable rule IDs exist for every domain", () => {
    expect(RULES.map((rule) => rule.id)).toEqual([
      "nl-employment-2026-r2",
      "nl-income-tax-2026-r2",
      "nl-payroll-2026-r3",
      "nl-zorgtoeslag-2026-r2",
      "nl-huurtoeslag-2026-r2",
      "nl-reimbursements-2026-r2",
    ]);
  });

  test("every rule records its legal and effective period and verification date", () => {
    for (const rule of RULES) {
      expect(rule.schemaVersion).toBe("1");
      expect(rule.legalFrom).toBe("2026-01-01");
      expect(rule.effectiveFrom).toBe("2026-01-01");
      expect(rule.verifiedAt).toBe("2026-11-12");
      expect(rule.sources.length).toBeGreaterThan(0);
    }
  });

  test("every source carries a title, URL, effective date, checked date, and hash", () => {
    for (const source of ALL_SOURCES) {
      expect(source.title.length).toBeGreaterThan(0);
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(source.checkedAt).toBe("2026-11-12");
      expect(source.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  test("every source used by a rule is listed in the source registry", () => {
    const known = new Set(ALL_SOURCES.map((source) => source.url));
    for (const rule of RULES) {
      for (const source of rule.sources) {
        expect(known.has(source.url)).toBe(true);
      }
    }
  });

  test("the toeslagen rules cite their published calculation leaflets", () => {
    expect(BUNDLE_2026.zorgtoeslag.sources[0]?.url).toContain("berekening_zorgtoeslag");
    expect(BUNDLE_2026.huurtoeslag.sources[0]?.url).toContain("berekening_huurtoeslag");
  });
});

describe("selection and resolution", () => {
  test("the selection validates against the public core contract", () => {
    const selection = ruleSelectionFor(BUNDLE_2026);
    const roundTripped = parseRuleSelection(JSON.parse(JSON.stringify(selection)));

    expect(roundTripped).toEqual(selection);
    expect(roundTripped.ruleIds).toHaveLength(6);
    expect(roundTripped.bundleContentHash).toBe(PINNED_BUNDLE_HASH);
  });

  test("only current rule IDs resolve to their definitions", () => {
    for (const id of Object.keys(PINNED_HASHES)) {
      expect(findRuleById(id)?.contentHash).toBe(PINNED_HASHES[id]);
    }
    for (const id of [
      "nl-employment-2026-r1",
      "nl-income-tax-2026-r1",
      "nl-payroll-2026-r1",
      "nl-payroll-2026-r2",
      "nl-zorgtoeslag-2026-r1",
      "nl-huurtoeslag-2026-r1",
      "nl-reimbursements-2026-r1",
    ]) {
      expect(findRuleById(id)).toBeUndefined();
    }
    expect(findRuleById("nl-income-tax-2027-r1")).toBeUndefined();
  });

  test("every rule survives a JSON round trip through the core parser", () => {
    for (const rule of RULES) {
      const parsed = parseRuleDefinition(
        JSON.parse(JSON.stringify(rule)),
        (input) => input,
        `rule ${rule.id}`,
      );
      expect(parsed.id).toBe(rule.id);
      expect(parsed.contentHash).toBe(rule.contentHash);
    }
  });
});

describe("mutation resistance", () => {
  test("changing one constant changes the content hash", () => {
    const original = contentHashOf({ ratePpm: 137_300 });
    expect(contentHashOf({ ratePpm: 137_301 })).not.toBe(original);
  });

  test("changing a source hash changes the rule hash", () => {
    const identity = {
      id: "nl-test-r1",
      legalFrom: "2026-01-01",
      effectiveFrom: "2026-01-01",
      verifiedAt: "2026-08-16",
      sources: [
        {
          title: "t",
          url: "https://example.invalid/a",
          effectiveFrom: "2026-01-01",
          checkedAt: "2026-08-16",
          contentHash: "sha256:aa",
        },
      ],
    };
    const identityWithNewSource = {
      ...identity,
      sources: [{ ...identity.sources[0]!, contentHash: "sha256:bb" }],
    };
    const parse = (input: unknown) => input as { readonly value: number };

    expect(defineRule(identity, { value: 1 }, parse).contentHash).not.toBe(
      defineRule(identityWithNewSource, { value: 1 }, parse).contentHash,
    );
  });

  test("a rule without a source is rejected", () => {
    expect(() =>
      defineRule(
        {
          id: "nl-test-r2",
          legalFrom: "2026-01-01",
          effectiveFrom: "2026-01-01",
          verifiedAt: "2026-08-16",
          sources: [],
        },
        { value: 1 },
        (input) => input as { readonly value: number },
      ),
    ).toThrow();
  });
});
