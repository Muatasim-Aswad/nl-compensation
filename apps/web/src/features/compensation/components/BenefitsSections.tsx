import type { PayPeriod } from "@nl-compensation/core";
import { cx, fieldGrid } from "../../../shared/ui.js";
import { copy } from "../copy.js";
import { ItemHeader, PlainSelect, PlainText, Section } from "./Controls.js";
import { ChoiceFactField, NumberFactField, yesNoOptions } from "./Fields.js";
import { patchScenario, type FormProps } from "./form.js";
const repeatableItem = "border border-line bg-field/48 p-4 [&+&]:mt-4";
const buttonRow = "flex flex-wrap gap-[0.6rem]";
const addButton =
  "mt-4 rounded-control border border-dashed border-dash bg-transparent px-[0.8rem] py-[0.65rem] text-detail font-bold text-pine";

const periods: readonly PayPeriod[] = ["monthly", "four_weekly", "hourly", "annual"];

export function ReimbursementsSection({ scenario, dispatch }: FormProps) {
  const patch = patchScenario(dispatch);
  const payrollPeriodLabel = scenario.salaries[0]?.period === "four_weekly" ? "4 weeks" : "month";
  return (
    <Section
      number="04"
      title={copy.BenefitsSections.travelReimbursementsTitle}
      intro={copy.BenefitsSections.travelReimbursementsIntro}
    >
      <div className={cx(fieldGrid, "mb-4")}>
        <NumberFactField
          label={copy.BenefitsSections.recurringTravelReimbursementLabel}
          hint={copy.BenefitsSections.recurringTravelReimbursementHint}
          suffix={copy.BenefitsSections.periodUnit(payrollPeriodLabel)}
          step={0.01}
          min={0}
          draft={scenario.travelReimbursement}
          path={["travelReimbursement"]}
          dispatch={dispatch}
        />
      </div>
      {scenario.reimbursements.map((item, index) => (
        <article className={repeatableItem} key={item.id}>
          <ItemHeader
            title={copy.BenefitsSections.reimbursementTitle(index + 1)}
            onRemove={() => dispatch({ type: "remove-item", collection: "reimbursements", index })}
          />
          <div className={fieldGrid}>
            <PlainText
              label={copy.BenefitsSections.labelLabel}
              value={item.label}
              onChange={(label) => patch(["reimbursements", index], { label })}
            />
            <PlainSelect
              label={copy.BenefitsSections.payUnitLabel}
              value={item.period}
              options={periods}
              onChange={(period) => patch(["reimbursements", index], { period })}
            />
            <NumberFactField
              label={copy.BenefitsSections.amountLabel}
              suffix={copy.BenefitsSections.euroUnit}
              step={0.01}
              min={0}
              draft={item.amount}
              path={["reimbursements", index, "amount"]}
              dispatch={dispatch}
            />
            <ChoiceFactField
              label={copy.BenefitsSections.taxableLabel}
              draft={item.taxable}
              path={["reimbursements", index, "taxable"]}
              options={yesNoOptions}
              dispatch={dispatch}
            />
          </div>
        </article>
      ))}
      <button
        type="button"
        className={addButton}
        onClick={() => dispatch({ type: "add-reimbursement" })}
      >
        {copy.BenefitsSections.travelOrReimbursement}
      </button>
    </Section>
  );
}

export function BenefitsSection({ scenario, dispatch }: FormProps) {
  const patch = patchScenario(dispatch);
  return (
    <Section
      number="05"
      title={copy.BenefitsSections.educationBenefitsTitle}
      intro={copy.BenefitsSections.educationBenefitsIntro}
    >
      <div className={cx(fieldGrid, "mb-4")}>
        <NumberFactField
          label={copy.BenefitsSections.annualEducationBudgetLabel}
          suffix={copy.BenefitsSections.euroYearUnit}
          step={0.01}
          min={0}
          draft={scenario.educationBudget}
          path={["educationBudget"]}
          dispatch={dispatch}
        />
      </div>
      {[
        ...scenario.taxableBenefits.map((item) => ({ item, taxable: true })),
        ...scenario.nonCashBenefits.map((item) => ({ item, taxable: false })),
      ].map(({ item, taxable }, displayIndex) => {
        const collection = taxable ? "taxableBenefits" : "nonCashBenefits";
        const index = taxable
          ? scenario.taxableBenefits.indexOf(item)
          : scenario.nonCashBenefits.indexOf(item);
        return (
          <article className={repeatableItem} key={item.id}>
            <ItemHeader
              title={copy.BenefitsSections.benefitTitle(taxable, displayIndex + 1)}
              onRemove={() => dispatch({ type: "remove-item", collection, index })}
            />
            <div className={fieldGrid}>
              <PlainText
                label={copy.BenefitsSections.labelLabel}
                value={item.label}
                onChange={(label) => patch([collection, index], { label })}
              />
              {!taxable && (
                <PlainSelect
                  label={copy.BenefitsSections.benefitTypeLabel}
                  value={item.kind}
                  options={["pension", "leave", "insurance", "equipment", "equity", "other"]}
                  onChange={(kind) => patch([collection, index], { kind })}
                />
              )}
              <NumberFactField
                label={copy.BenefitsSections.benefitValueLabel(taxable)}
                suffix={copy.BenefitsSections.euroYearUnit}
                step={0.01}
                min={0}
                draft={item.value}
                path={[collection, index, "value"]}
                dispatch={dispatch}
              />
            </div>
          </article>
        );
      })}
      <div className={buttonRow}>
        <button
          type="button"
          className={addButton}
          onClick={() => dispatch({ type: "add-benefit", taxable: true })}
        >
          {copy.BenefitsSections.taxableBenefit}
        </button>
        <button
          type="button"
          className={addButton}
          onClick={() => dispatch({ type: "add-benefit", taxable: false })}
        >
          {copy.BenefitsSections.otherNonCashBenefit}
        </button>
      </div>
    </Section>
  );
}

export function PensionLeaveSection({ scenario, dispatch }: FormProps) {
  return (
    <Section
      number="08"
      title={copy.BenefitsSections.pensionLeaveTitle}
      intro={copy.BenefitsSections.pensionLeaveIntro}
    >
      <p className="mb-5 bg-sand px-4 py-[0.85rem] text-[0.8rem] leading-[1.55] text-note">
        {copy.BenefitsSections.pensionLeaveDescription}
      </p>
      <div className={fieldGrid}>
        <NumberFactField
          label={copy.BenefitsSections.employeePensionContributionLabel}
          suffix={copy.BenefitsSections.euroMonthUnit}
          step={0.01}
          min={0}
          draft={scenario.pension.employeeMonthly}
          path={["pension", "employeeMonthly"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.BenefitsSections.employerPensionContributionLabel}
          suffix={copy.BenefitsSections.euroMonthUnit}
          step={0.01}
          min={0}
          draft={scenario.pension.employerMonthly}
          path={["pension", "employerMonthly"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.BenefitsSections.pensionableSalaryLabel}
          suffix={copy.BenefitsSections.euroYearUnit}
          step={0.01}
          min={0}
          draft={scenario.pension.pensionableSalaryAnnual}
          path={["pension", "pensionableSalaryAnnual"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.BenefitsSections.employerPremiumSplitLabel}
          suffix="%"
          step={0.01}
          min={0}
          draft={scenario.pension.premiumSplit}
          path={["pension", "premiumSplit"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.BenefitsSections.knownAccrualValueLabel}
          suffix={copy.BenefitsSections.euroYearUnit}
          step={0.01}
          min={0}
          draft={scenario.pension.accrualValueAnnual}
          path={["pension", "accrualValueAnnual"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.BenefitsSections.paidLeaveLabel}
          suffix={copy.BenefitsSections.daysYearUnit}
          step={0.5}
          min={0}
          draft={scenario.leave.paid}
          path={["leave", "paid"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.BenefitsSections.statutoryLeaveLabel}
          suffix={copy.BenefitsSections.daysYearUnit}
          step={0.5}
          min={0}
          draft={scenario.leave.statutory}
          path={["leave", "statutory"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.BenefitsSections.purchasedLeaveLabel}
          suffix={copy.BenefitsSections.daysYearUnit}
          step={0.5}
          min={0}
          draft={scenario.leave.purchased}
          path={["leave", "purchased"]}
          dispatch={dispatch}
        />
      </div>
    </Section>
  );
}

export function HoursSection({ scenario, dispatch }: FormProps) {
  return (
    <Section
      number="09"
      title={copy.BenefitsSections.hoursFTETitle}
      intro={copy.BenefitsSections.hoursFTEIntro}
    >
      <div className={fieldGrid}>
        <NumberFactField
          label={copy.BenefitsSections.contractHoursLabel}
          suffix={copy.BenefitsSections.hoursWeekUnit}
          step={0.5}
          min={0}
          draft={scenario.actualHours}
          path={["actualHours"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.BenefitsSections.employerFullTimeBasisLabel}
          hint={copy.BenefitsSections.employerFullTimeBasisHint}
          suffix={copy.BenefitsSections.hoursWeekUnit}
          step={0.5}
          min={0}
          draft={scenario.fullTimeHours}
          path={["fullTimeHours"]}
          dispatch={dispatch}
        />
      </div>
    </Section>
  );
}
