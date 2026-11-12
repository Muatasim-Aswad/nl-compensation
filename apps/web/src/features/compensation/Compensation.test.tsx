import {
  eur,
  type CompensationReport,
  type Money,
  type NormalizationOutcome,
  type NormalizationReport,
  type Value,
} from "@nl-compensation/core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { App } from "../../app/App.js";
import {
  DEFAULT_RANGE_DISPLAY_MODE,
  RangeDisplayModeControl,
  calculationScenarioForMode,
  hasFastEntryRange,
} from "./Compensation.js";
import { fastExactNumberPatch } from "./components/Controls.js";
import { DecisionSummary, NonCashBenefits, Report } from "./components/Report.js";
import { SCENARIO_DRAFT_STORAGE_KEY, loadScenarioDraft, persistScenarioDraft } from "./draft.js";
import { formatMoneyValue } from "./format.js";
import { initialScenario } from "./scenario.js";

const money = (euros: number): Value<Money> => ({
  kind: "exact",
  value: eur(euros * 100),
});

const moneyCents = (amountCents: number): Value<Money> => ({
  kind: "exact",
  value: eur(amountCents),
});

const moneyRange = (minCents: number, maxCents: number): Value<Money> => ({
  kind: "range",
  min: eur(minCents),
  max: eur(maxCents),
  correlationId: "salary-range",
});

const unavailableMoney = {
  kind: "unknown",
  reason: "not_provided",
} as const satisfies Value<Money>;

const normalized = {
  precision: "exact",
  guaranteedAnnualCash: money(65_000),
  guaranteedAnnualCashAtActualHours: money(65_000),
  guaranteedAnnualCashAt40Hours: money(80_000),
  nominalHourlyEquivalent: money(31.25),
  guaranteedBreakdown: [
    { componentId: "base_salary", label: "Base salary", annualAmount: money(60_000) },
    { componentId: "holiday_allowance", label: "Holiday allowance", annualAmount: money(5_000) },
  ],
  expectedVariableCash: money(0),
} satisfies NormalizationReport;

function payrollReport(
  regularPayPeriod: "monthly" | "four_weekly" = "monthly",
  overrides: Partial<CompensationReport["fiscalPayroll"]> = {},
): CompensationReport {
  return {
    fiscalPayroll: {
      regularPayPeriod,
      normalPeriodGross: money(5_000),
      normalPeriodNetSalary: money(3_500),
      normalPeriodNetToBank: money(3_500),
      annualNetAfterSettlement: money(43_000),
      averageMonthlyNet: money(3_583.33),
      ...overrides,
    },
    nonCash: {
      benefits: [],
    },
  } as unknown as CompensationReport;
}

afterEach(() => vi.unstubAllGlobals());

describe("compensation form", () => {
  test("renders the accessible open form and non-hover report explanations", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Guaranteed annual gross");
    expect(html).toContain("Exact");
    expect(html).toContain("Range");
    expect(html).toContain("Unknown");
    expect(html).toContain("Evidence · user / explicit");
    expect(html).not.toContain("Salary fact 1");
    expect(html).not.toContain("Remove salary quote");
    expect(html).toContain("Advanced salary input");
    expect(html).toContain("+ Add another quoted amount");
    expect(html).not.toMatch(/<details[^>]*open=""[^>]*><summary[^>]*>Advanced salary input/);
    expect(html).not.toContain("Save local profile");
    expect(html).not.toContain("Save current case");
    expect(html).not.toContain("What do these save?");
    expect(html).not.toContain("Automatic estimates");
    expect(html).toContain("Local-first · scenario saves in this browser");
    expect(html).not.toContain("values stay in memory until you save");
    expect(html).not.toContain("Refresh Dutch estimates");
    expect(html).toContain("Guaranteed annual gross: explanation");
    expect(html).toContain("Dutch allowance terms: explanation");
    expect(html).toContain("Guaranteed 13th month offered");
    expect(html).toMatch(
      /<summary[^>]*aria-label="Guaranteed annual gross: explanation"[^>]*>i<\/summary>/,
    );
    expect(html).toContain("Employer full-time basis: more information");
    expect(html).toContain("Salary: explanation");
    expect(html).toMatch(/<label class="sr-only"[^>]*>Gross salary<\/label>/);
    expect(html).toContain('class="sr-only">Quoted unit</span>');
    expect(html).toContain("Hide intro");
    expect(html).toContain("Annual and monthly net");
    expect(html).toContain('href="#scenario-form"');
    expect(html).not.toContain("+ Education budget");
    expect(html).not.toContain("Net reimbursements paid with salary");
    expect(html).toMatch(/<details(?![^>]*open)[^>]*><summary[^>]*><span[^>]*>01<\/span>/);
    expect(html.indexOf(">Salary</strong>")).toBeLessThan(html.indexOf(">Holiday pay</strong>"));
    expect(html.indexOf(">Holiday pay</strong>")).toBeLessThan(
      html.indexOf(">13th month</strong>"),
    );
    expect(html.indexOf(">13th month</strong>")).toBeLessThan(
      html.indexOf(">Travel &amp; reimbursements</strong>"),
    );
    expect(html.indexOf(">Travel &amp; reimbursements</strong>")).toBeLessThan(
      html.indexOf(">Education &amp; benefits</strong>"),
    );
    expect(html.indexOf(">Education &amp; benefits</strong>")).toBeLessThan(
      html.indexOf(">Hours &amp; FTE</strong>"),
    );
  });

  test("places a compact shared-fact fast entry before the numbered sections", () => {
    const html = renderToStaticMarkup(<App />);
    const fastEntry = html.indexOf('aria-label="Offer essentials"');
    const salarySection = html.search(/<span[^>]*>01<\/span>/);
    const fastHtml = html.slice(fastEntry, salarySection);

    expect(fastEntry).toBeGreaterThan(-1);
    expect(fastEntry).toBeLessThan(salarySection);
    expect(fastHtml).not.toContain(">Fast entry<");
    expect(fastHtml).not.toContain(">Offer essentials<");
    expect(fastHtml).toContain('aria-label="Fast gross salary value shape"');
    expect(fastHtml).toContain("Holiday pay included");
    expect(fastHtml).toContain("13th month");
    expect(fastHtml).not.toContain("Fast 13th-month gross amount");
    expect(fastHtml).toContain('placeholder="Annual education budget · EUR/year"');
    expect(fastHtml).toContain('aria-label="Annual education budget (EUR/year)"');
    expect(fastHtml).toContain('title="Annual education budget (EUR/year)"');
    expect(fastHtml).toContain('placeholder="Recurring travel reimbursement · EUR/month"');
    expect(fastHtml).toContain('aria-label="Recurring travel reimbursement (EUR/month)"');
    expect(fastHtml).not.toContain("Annual education budget value shape");
    expect(fastHtml).not.toContain("Recurring travel reimbursement value shape");
    expect(fastHtml).toContain('<span class="sr-only">Fast gross salary</span>');
    expect(fastHtml).toContain('<span class="sr-only">Fast quoted unit</span>');
    expect(fastHtml.indexOf("Annual education budget · EUR/year")).toBeLessThan(
      fastHtml.indexOf("Holiday pay included"),
    );
    expect(fastHtml.indexOf("Recurring travel reimbursement · EUR/month")).toBeLessThan(
      fastHtml.indexOf("Holiday pay included"),
    );
  });

  test("maps fast exact inputs to the shared fact and clearing back to unknown", () => {
    expect(fastExactNumberPatch("1250.5")).toEqual({ mode: "exact", exact: 1250.5 });
    expect(fastExactNumberPatch("")).toEqual({
      mode: "unknown",
      unknownReason: "not_provided",
    });
  });

  test("shows the range display selector only for a fast-entry range and defaults to both", () => {
    expect(hasFastEntryRange(initialScenario)).toBe(false);
    expect(renderToStaticMarkup(<App />)).not.toContain('aria-label="Range display mode"');

    const rangeAmount = {
      ...initialScenario.salaries[0]!.amount,
      mode: "range" as const,
      min: 4_000,
      max: 5_000,
    };
    expect(
      hasFastEntryRange({
        ...initialScenario,
        salaries: [{ ...initialScenario.salaries[0]!, amount: rangeAmount }],
      }),
    ).toBe(true);
    expect(
      hasFastEntryRange({
        ...initialScenario,
        educationBudget: { ...initialScenario.educationBudget, mode: "range" },
      }),
    ).toBe(true);
    expect(
      hasFastEntryRange({
        ...initialScenario,
        travelReimbursement: { ...initialScenario.travelReimbursement, mode: "range" },
      }),
    ).toBe(true);

    expect(DEFAULT_RANGE_DISPLAY_MODE).toBe("both");
    const selector = renderToStaticMarkup(
      <RangeDisplayModeControl value={DEFAULT_RANGE_DISPLAY_MODE} onChange={() => undefined} />,
    );
    expect(selector).toContain('aria-label="Range display mode"');
    expect(selector).toContain('<option value="both" selected="">Both</option>');
    expect(selector).toContain("Minimum");
    expect(selector).toContain("Maximum");
    expect(selector).toContain("Average");
  });

  test("maps selector choices to exact calculation scenarios while Both preserves the draft", () => {
    const ranged = {
      ...initialScenario,
      salaries: [
        {
          ...initialScenario.salaries[0]!,
          amount: {
            ...initialScenario.salaries[0]!.amount,
            mode: "range" as const,
            min: 4_000,
            max: 5_000,
          },
        },
      ],
    };

    expect(calculationScenarioForMode(ranged, "minimum").salaries[0]?.amount).toMatchObject({
      mode: "exact",
      exact: 4_000,
    });
    expect(calculationScenarioForMode(ranged, "maximum").salaries[0]?.amount).toMatchObject({
      mode: "exact",
      exact: 5_000,
    });
    expect(calculationScenarioForMode(ranged, "average").salaries[0]?.amount).toMatchObject({
      mode: "exact",
      exact: 4_500,
    });
    expect(calculationScenarioForMode(ranged, "both")).toBe(ranged);
    expect(ranged.salaries[0]?.amount.mode).toBe("range");
  });

  test("rounds only the decision summary to whole euros and keeps detailed cents", () => {
    const preciseRange = moneyRange(6_000_049, 7_000_051);
    const preciseNormalized: NormalizationReport = {
      ...normalized,
      guaranteedAnnualCash: moneyCents(6_500_049),
      guaranteedBreakdown: [
        { componentId: "base_salary", label: "Base salary", annualAmount: preciseRange },
      ],
    };
    const normalization = {
      report: preciseNormalized,
      salarySolution: {
        representations: [{ period: "annual", amount: preciseRange }],
      },
      diagnostics: [],
      completeness: { precision: "exact", missingInputs: [] },
      assumptions: [],
      derivationTrace: [],
    } as unknown as NormalizationOutcome;

    const html = renderToStaticMarkup(
      <Report normalization={normalization} show40HourEquivalent={false} />,
    );

    expect(html).toContain(formatMoneyValue(moneyCents(6_500_049), true));
    expect(html).toContain(formatMoneyValue(preciseRange, true));
    expect(html).toContain(formatMoneyValue(preciseRange));
  });

  test("shows true monthly averages in the decision summary", () => {
    const html = renderToStaticMarkup(
      <DecisionSummary
        normalized={normalized}
        report={payrollReport()}
        show40HourEquivalent={false}
      />,
    );

    expect(html.match(/<article/g)).toHaveLength(5);
    expect(html).toContain("Average monthly gross");
    expect(html).toContain("Average monthly net");
    expect(html).toContain(formatMoneyValue(money(65_000 / 12), true));
    expect(html).toContain(formatMoneyValue(money(3_583.33), true));
    expect(html).not.toContain("Normal monthly");
    expect(html).toContain("Annual base gross");
    expect(html).toContain("Guaranteed annual gross");
    expect(html).toContain("Estimated annual net after settlement");
    expect(html).not.toContain("Holiday allowance");
    expect(html).not.toContain("13th month");
    expect(html).not.toContain("IKB");
    expect(html).not.toContain("40-hour-equivalent gross");
    expect(html.indexOf("Guaranteed annual gross")).toBeLessThan(html.indexOf("Annual base gross"));
    expect(html.indexOf("Annual base gross")).toBeLessThan(
      html.indexOf("Estimated annual net after settlement"),
    );
    expect(html.indexOf("Estimated annual net after settlement")).toBeLessThan(
      html.indexOf("Average monthly gross"),
    );
    expect(html.indexOf("Average monthly gross")).toBeLessThan(html.indexOf("Average monthly net"));
  });

  test("shows a known education budget in the summary and detailed non-cash package", () => {
    const report = {
      ...payrollReport(),
      nonCash: {
        precision: "exact",
        pensionEmployerContribution: unavailableMoney,
        paidLeaveDays: { kind: "exact", value: 25 },
        benefits: [{ id: "education-budget", label: "Education budget", value: money(1_000) }],
      },
    } as CompensationReport;
    const summary = renderToStaticMarkup(
      <DecisionSummary normalized={normalized} report={report} show40HourEquivalent={false} />,
    );
    expect(summary.match(/<article/g)).toHaveLength(5);
    expect(summary).toContain("<ul");
    expect(summary).toContain("Annual education budget");
    expect(summary).toContain(formatMoneyValue(money(1_000), true));
    expect(summary.indexOf("Average monthly net")).toBeLessThan(
      summary.indexOf("Annual education budget"),
    );

    const detail = renderToStaticMarkup(<NonCashBenefits benefits={report.nonCash.benefits} />);
    expect(detail).toContain("<ul");
    expect(detail).not.toContain("<article");
    expect(detail).toContain("Education budget");
    expect(detail).toContain(formatMoneyValue(money(1_000)));
  });

  test("keeps period-specific bank deposits out of the monthly summary", () => {
    const html = renderToStaticMarkup(
      <DecisionSummary
        normalized={normalized}
        report={payrollReport("monthly", { normalPeriodNetToBank: money(3_650) })}
        show40HourEquivalent={false}
      />,
    );

    expect(html.match(/<article/g)).toHaveLength(5);
    expect(html).toContain("Average monthly gross");
    expect(html).toContain("Average monthly net");
    expect(html).not.toContain("bank deposit");
  });

  test("omits unavailable values from the decision summary", () => {
    const unavailableNormalized: NormalizationReport = {
      ...normalized,
      guaranteedAnnualCash: unavailableMoney,
      guaranteedBreakdown: [
        { componentId: "base_salary", label: "Base salary", annualAmount: unavailableMoney },
      ],
    };
    const html = renderToStaticMarkup(
      <DecisionSummary
        normalized={unavailableNormalized}
        report={payrollReport("monthly", {
          normalPeriodGross: unavailableMoney,
          normalPeriodNetToBank: unavailableMoney,
          annualNetAfterSettlement: unavailableMoney,
          averageMonthlyNet: unavailableMoney,
        })}
        show40HourEquivalent={false}
      />,
    );

    expect(html.match(/<article/g) ?? []).toHaveLength(0);
    expect(html).not.toContain("Not available yet");
    expect(html).not.toContain("Average monthly gross");
    expect(html).not.toContain("Average monthly net");
    expect(html).not.toContain("Annual base gross");
    expect(html).not.toContain("Guaranteed annual gross");
    expect(html).not.toContain("Estimated annual net after settlement");
  });

  test("keeps the decision summary monthly for four-weekly payroll", () => {
    const html = renderToStaticMarkup(
      <DecisionSummary
        normalized={normalized}
        report={payrollReport("four_weekly")}
        show40HourEquivalent
      />,
    );

    expect(html.match(/<article/g)).toHaveLength(6);
    expect(html).toContain("Average monthly gross");
    expect(html).toContain("Average monthly net");
    expect(html).not.toContain("four-weekly");
    expect(html).toContain("40-hour-equivalent gross");
    expect(html.indexOf("40-hour-equivalent gross")).toBeLessThan(
      html.indexOf("Guaranteed annual gross"),
    );
  });

  test("restores a valid browser-local scenario as the initial form state", () => {
    const restored = {
      ...initialScenario,
      caseId: "browser-latest",
      salaries: [
        {
          ...initialScenario.salaries[0]!,
          amount: { ...initialScenario.salaries[0]!.amount, exact: 7_125 },
        },
      ],
    };
    const storage = {
      getItem: vi.fn((key: string) =>
        key === SCENARIO_DRAFT_STORAGE_KEY
          ? JSON.stringify({ version: 1, scenario: restored })
          : null,
      ),
    };

    expect(loadScenarioDraft(storage)).toEqual(restored);
    vi.stubGlobal("window", { localStorage: storage });
    const html = renderToStaticMarkup(<App />);
    expect(html).toMatch(/aria-label="Fast gross salary"[^>]*value="7125"/);
  });

  test("autosaves the complete latest draft in a versioned product-specific envelope", () => {
    const scenario = { ...initialScenario, caseId: "autosaved-latest" };
    const setItem = vi.fn();

    persistScenarioDraft(scenario, { setItem });

    expect(SCENARIO_DRAFT_STORAGE_KEY).toBe("nl-compensation:scenario-draft:v1");
    expect(setItem).toHaveBeenCalledOnce();
    const [key, raw] = setItem.mock.calls[0] as [string, string];
    expect(key).toBe(SCENARIO_DRAFT_STORAGE_KEY);
    expect(JSON.parse(raw)).toEqual({ version: 1, scenario });
  });

  test.each([
    ["invalid JSON", { getItem: () => "{" }],
    ["stale version", { getItem: () => JSON.stringify({ version: 0, scenario: initialScenario }) }],
    ["invalid draft", { getItem: () => JSON.stringify({ version: 1, scenario: {} }) }],
    [
      "unavailable storage",
      {
        getItem: () => {
          throw new Error("storage denied");
        },
      },
    ],
  ])("falls back safely for %s", (_, storage) => {
    expect(loadScenarioDraft(storage)).toBe(initialScenario);
  });

  test("falls back safely during server-side rendering without browser storage", () => {
    expect(loadScenarioDraft()).toBe(initialScenario);
  });

  test("restores a hidden intro preference from browser storage", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "false",
        setItem: () => undefined,
      },
    });
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain("Turn a messy offer into");
    expect(html).toContain("Show intro");
  });
});
