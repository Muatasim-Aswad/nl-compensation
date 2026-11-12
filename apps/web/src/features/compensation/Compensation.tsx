import { type PayPeriod } from "@nl-compensation/core";
import { cx, eyebrow, panel, panelTitle } from "../../shared/ui.js";
import { patchScenario } from "./components/form.js";
import { Report } from "./components/Report.js";
import { SaveControls } from "./components/SaveControls.js";
import { copy } from "./copy.js";
import type { RangeDisplayMode } from "./format.js";
import { scenarioAtRangeSelection, type ScenarioDraft } from "./scenario.js";
import { useCompensation } from "./useCompensation.js";

import {
  BenefitsSection,
  HoursSection,
  PensionLeaveSection,
  ReimbursementsSection,
} from "./components/BenefitsSections.js";
import { FastExactNumberControl, FastNumberControl, PlainSelect } from "./components/Controls.js";
import { FirstYearSection, HouseholdSection } from "./components/HouseholdSections.js";
import {
  CashSection,
  HolidaySection,
  IkbSection,
  SalarySection,
  ThirteenthMonthSection,
} from "./components/PaySections.js";
const fastControl = "h-control min-h-control py-[0.42rem] text-detail";
const fastCheckbox = "m-0 size-4 accent-pine";
const fastToggle = "flex min-h-9 items-center gap-[0.45rem] text-small font-bold text-label";

const periods: readonly PayPeriod[] = ["monthly", "four_weekly", "hourly", "annual"];
export const DEFAULT_RANGE_DISPLAY_MODE: RangeDisplayMode = "both";

export function hasFastEntryRange(
  scenario: Pick<ScenarioDraft, "salaries" | "educationBudget" | "travelReimbursement">,
): boolean {
  return (
    scenario.salaries[0]?.amount.mode === "range" ||
    scenario.educationBudget.mode === "range" ||
    scenario.travelReimbursement.mode === "range"
  );
}

export function calculationScenarioForMode(
  scenario: ScenarioDraft,
  mode: RangeDisplayMode,
): ScenarioDraft {
  return mode === "both" ? scenario : scenarioAtRangeSelection(scenario, mode);
}

export function RangeDisplayModeControl({
  value,
  onChange,
}: {
  readonly value: RangeDisplayMode;
  readonly onChange: (value: RangeDisplayMode) => void;
}) {
  return (
    <label className="flex items-center justify-end gap-[0.45rem] text-small font-bold whitespace-nowrap text-label max-sm:justify-start">
      <span>{copy.Compensation.rangeDisplay}</span>
      <select
        className="min-h-9 w-auto min-w-28 py-[0.42rem] text-small"
        aria-label={copy.Compensation.rangeDisplayModeAccessibleName}
        value={value}
        onChange={(event) => onChange(event.target.value as RangeDisplayMode)}
      >
        <option value="minimum">{copy.Compensation.minimum}</option>
        <option value="maximum">{copy.Compensation.maximum}</option>
        <option value="average">{copy.Compensation.average}</option>
        <option value="both">{copy.Compensation.both}</option>
      </select>
    </label>
  );
}

export function Compensation({ autosave = true }: { readonly autosave?: boolean }) {
  const {
    scenario,
    dispatch,
    calculationScenario,
    local,
    report,
    calculationError,
    loading,
    rangeDisplayMode,
    setRangeDisplayMode,
  } = useCompensation(autosave);
  const patch = patchScenario(dispatch);
  const payrollPeriodLabel = scenario.salaries[0]?.period === "four_weekly" ? "4 weeks" : "month";

  return (
    <>
      <div className="grid grid-cols-[minmax(480px,1.06fr)_minmax(430px,0.94fr)] items-start border-b border-line max-lg:grid-cols-1">
        <form
          id="scenario-form"
          className="min-w-0 border-r border-line px-gutter py-[clamp(2rem,4vw,4.5rem)] max-lg:border-r-0 max-lg:border-b max-sm:px-4 max-sm:py-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <SaveControls scenario={scenario} dispatch={dispatch} />
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <p className={eyebrow}>{copy.Compensation.scenarioFacts}</p>
              <h2 className="text-[clamp(1.5rem,2.3vw,2.25rem)] font-bold tracking-[-0.04em]">
                {copy.Compensation.buildTheOffer}
              </h2>
            </div>
            <span className="font-mono text-detail text-muted">
              {copy.Compensation.salaryFacts(scenario.salaries.length)}
            </span>
          </div>

          <section
            className="mb-6 rounded border border-pine-border bg-pine-light/45 p-4"
            aria-label={copy.Compensation.offerEssentialsAccessibleName}
          >
            <div className="grid grid-cols-2 items-end gap-x-[0.8rem] gap-y-[0.65rem] max-sm:grid-cols-1">
              {scenario.salaries[0] && (
                <div className="col-span-full grid grid-cols-[minmax(0,1fr)_minmax(7.5rem,0.28fr)] items-start gap-2">
                  <FastNumberControl
                    label={copy.Compensation.fastGrossSalaryLabel}
                    hideLabel
                    suffix={copy.Compensation.euroUnit}
                    draft={scenario.salaries[0].amount}
                    onPatch={(value) => patch(["salaries", 0, "amount"], value)}
                  />
                  <PlainSelect
                    label={copy.Compensation.fastQuotedUnitLabel}
                    hideLabel
                    selectClassName={fastControl}
                    value={scenario.salaries[0].period}
                    options={periods}
                    onChange={(period) => patch(["salaries", 0], { period })}
                  />
                </div>
              )}
              <FastExactNumberControl
                label={copy.Compensation.annualEducationBudgetEURYearLabel}
                placeholder={copy.Compensation.annualEducationBudgetEURYearPlaceholder}
                draft={scenario.educationBudget}
                onPatch={(value) => patch(["educationBudget"], value)}
              />
              <FastExactNumberControl
                label={copy.Compensation.recurringTravelReimbursementEURLabel(payrollPeriodLabel)}
                placeholder={copy.Compensation.recurringTravelReimbursementEURPlaceholder(
                  payrollPeriodLabel,
                )}
                draft={scenario.travelReimbursement}
                onPatch={(value) => patch(["travelReimbursement"], value)}
              />
              <div className="col-span-full grid grid-cols-[repeat(2,minmax(0,1fr))_auto] items-center gap-[0.8rem] max-sm:grid-cols-1">
                <label className={fastToggle}>
                  <input
                    type="checkbox"
                    className={fastCheckbox}
                    checked={
                      scenario.holidayInclusion.mode === "exact" &&
                      scenario.holidayInclusion.exact === "included"
                    }
                    onChange={(event) =>
                      patch(["holidayInclusion"], {
                        mode: "exact",
                        exact: event.target.checked ? "included" : "excluded",
                      })
                    }
                  />
                  <span>{copy.Compensation.holidayPayIncluded}</span>
                </label>
                <label className={fastToggle}>
                  <input
                    type="checkbox"
                    className={fastCheckbox}
                    checked={
                      scenario.thirteenthMonth.offered.mode === "exact" &&
                      scenario.thirteenthMonth.offered.exact
                    }
                    onChange={(event) =>
                      patch(["thirteenthMonth", "offered"], {
                        mode: "exact",
                        exact: event.target.checked,
                      })
                    }
                  />
                  <span>{copy.Compensation.thirteenthMonth}</span>
                </label>
                {hasFastEntryRange(scenario) && (
                  <RangeDisplayModeControl
                    value={rangeDisplayMode}
                    onChange={setRangeDisplayMode}
                  />
                )}
              </div>
            </div>
          </section>

          <SalarySection scenario={scenario} dispatch={dispatch} />

          <HolidaySection scenario={scenario} dispatch={dispatch} />

          <ThirteenthMonthSection scenario={scenario} dispatch={dispatch} />

          <ReimbursementsSection scenario={scenario} dispatch={dispatch} />

          <BenefitsSection scenario={scenario} dispatch={dispatch} />

          <IkbSection scenario={scenario} dispatch={dispatch} />

          <CashSection scenario={scenario} dispatch={dispatch} />

          <PensionLeaveSection scenario={scenario} dispatch={dispatch} />

          <HoursSection scenario={scenario} dispatch={dispatch} />

          <HouseholdSection scenario={scenario} dispatch={dispatch} />

          <FirstYearSection scenario={scenario} dispatch={dispatch} />
        </form>

        <aside
          className="min-w-0"
          aria-label={copy.Compensation.compensationReportAccessibleName}
          aria-busy={loading}
        >
          {calculationError && (
            <p role="alert" className="p-4 text-red">
              {calculationError}
            </p>
          )}
          {local.normalization ? (
            <Report
              normalization={local.normalization}
              report={report}
              show40HourEquivalent={
                calculationScenario.actualHours.mode === "exact" &&
                calculationScenario.actualHours.exact !== 40
              }
            />
          ) : (
            <section className={cx(panel("attention"), "mt-4")}>
              <h2 className={panelTitle}>{copy.Compensation.checkTheForm}</h2>
              <p className="my-4">{local.error}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
