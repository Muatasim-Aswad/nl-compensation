import {
  checkbox,
  cx,
  fieldFrame,
  fieldGrid,
  standaloneFieldLabel,
  subheading,
} from "../../../shared/ui.js";
import { copy } from "../copy.js";
import { Section } from "./Controls.js";
import { ChoiceFactField, NumberFactField, TextFactField, yesNoOptions } from "./Fields.js";
import { patchScenario, type FormProps } from "./form.js";

export function HouseholdSection({ scenario, dispatch }: FormProps) {
  const payrollPeriodLabel = scenario.salaries[0]?.period === "four_weekly" ? "4 weeks" : "month";
  return (
    <Section
      number="10"
      title={copy.HouseholdSections.fiscalHouseholdTitle}
      intro={copy.HouseholdSections.fiscalHouseholdIntro}
    >
      <h3 className={subheading}>{copy.HouseholdSections.fiscalFacts}</h3>
      <div className={fieldGrid}>
        <NumberFactField
          label={copy.HouseholdSections.preTaxPensionDeductionLabel}
          suffix={copy.HouseholdSections.euroYearUnit}
          step={0.01}
          min={0}
          draft={scenario.fiscal.pensionDeductionAnnual}
          path={["fiscal", "pensionDeductionAnnual"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.taxableNonCashBenefitLabel}
          hint={copy.HouseholdSections.taxableNonCashBenefitHint}
          suffix={copy.HouseholdSections.euroYearUnit}
          step={0.01}
          min={0}
          draft={scenario.fiscal.taxableBenefitsAnnual}
          path={["fiscal", "taxableBenefitsAnnual"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.additionalWithholdingLabel}
          suffix={copy.HouseholdSections.euroYearUnit}
          step={0.01}
          min={0}
          draft={scenario.fiscal.additionalWithholdingAnnual}
          path={["fiscal", "additionalWithholdingAnnual"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.postTaxPayslipDeductionsLabel}
          hint={copy.HouseholdSections.postTaxPayslipDeductionsHint}
          suffix={copy.HouseholdSections.periodUnit(payrollPeriodLabel)}
          step={0.01}
          min={0}
          draft={scenario.fiscal.postTaxDeductionsPerPeriod}
          path={["fiscal", "postTaxDeductionsPerPeriod"]}
          dispatch={dispatch}
        />
        <ChoiceFactField
          label={copy.HouseholdSections.payrollTaxCreditAppliedLabel}
          draft={scenario.fiscal.payrollTaxCredit}
          path={["fiscal", "payrollTaxCredit"]}
          options={yesNoOptions}
          dispatch={dispatch}
        />
        <ChoiceFactField
          label={copy.HouseholdSections.belowAOWAgeLabel}
          draft={scenario.fiscal.underAowAge}
          path={["fiscal", "underAowAge"]}
          options={yesNoOptions}
          dispatch={dispatch}
        />
        <ChoiceFactField
          label={copy.HouseholdSections.domesticDutchTaxpayerLabel}
          draft={scenario.fiscal.domesticTaxpayer}
          path={["fiscal", "domesticTaxpayer"]}
          options={yesNoOptions}
          dispatch={dispatch}
        />
      </div>
      <h3 className={subheading}>{copy.HouseholdSections.householdFacts}</h3>
      <div className={fieldGrid}>
        <ChoiceFactField
          label={copy.HouseholdSections.benefitPartnerLabel}
          draft={scenario.household.hasPartner}
          path={["household", "hasPartner"]}
          options={yesNoOptions}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.partnerIncomeLabel}
          suffix={copy.HouseholdSections.euroYearUnit}
          step={0.01}
          min={0}
          draft={scenario.household.partnerIncomeAnnual}
          path={["household", "partnerIncomeAnnual"]}
          dispatch={dispatch}
        />
        <ChoiceFactField
          label={copy.HouseholdSections.applicantInsuredInNLLabel}
          draft={scenario.household.applicantInsured}
          path={["household", "applicantInsured"]}
          options={yesNoOptions}
          dispatch={dispatch}
        />
        <ChoiceFactField
          label={copy.HouseholdSections.partnerInsuredInNLLabel}
          draft={scenario.household.partnerInsured}
          path={["household", "partnerInsured"]}
          options={yesNoOptions}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.applicantAssetsLabel}
          suffix={copy.HouseholdSections.euroUnit}
          step={0.01}
          min={0}
          draft={scenario.household.applicantAssets}
          path={["household", "applicantAssets"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.partnerAssetsLabel}
          suffix={copy.HouseholdSections.euroUnit}
          step={0.01}
          min={0}
          draft={scenario.household.partnerAssets}
          path={["household", "partnerAssets"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.householdMembersLabel}
          step={1}
          min={1}
          draft={scenario.household.members}
          path={["household", "members"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.childrenLabel}
          step={1}
          min={0}
          draft={scenario.household.children}
          path={["household", "children"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.applicantAgeLabel}
          suffix={copy.HouseholdSections.yearsUnit}
          step={1}
          min={0}
          draft={scenario.household.applicantAge}
          path={["household", "applicantAge"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.partnerAgeLabel}
          suffix={copy.HouseholdSections.yearsUnit}
          step={1}
          min={0}
          draft={scenario.household.partnerAge}
          path={["household", "partnerAge"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.kaleHuurLabel}
          hint={copy.HouseholdSections.kaleHuurHint}
          suffix={copy.HouseholdSections.euroMonthUnit}
          step={0.01}
          min={0}
          draft={scenario.household.kaleRentMonthly}
          path={["household", "kaleRentMonthly"]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.HouseholdSections.householdAnnualIncomeLabel}
          hint={copy.HouseholdSections.householdAnnualIncomeHint}
          suffix={copy.HouseholdSections.euroYearUnit}
          step={0.01}
          min={0}
          draft={scenario.household.householdIncomeAnnual}
          path={["household", "householdIncomeAnnual"]}
          dispatch={dispatch}
        />
      </div>
    </Section>
  );
}

export function FirstYearSection({ scenario, dispatch }: FormProps) {
  const patch = patchScenario(dispatch);
  return (
    <Section
      number="11"
      title={copy.HouseholdSections.firstCalendarYearTitle}
      intro={copy.HouseholdSections.firstCalendarYearIntro}
    >
      <label className="flex cursor-pointer items-start gap-[0.7rem]">
        <input
          type="checkbox"
          className={checkbox}
          checked={scenario.firstYear.enabled}
          onChange={(event) => patch(["firstYear"], { enabled: event.target.checked })}
        />
        <span className="grid gap-[0.2rem]">
          <strong>{copy.HouseholdSections.includeFirstYearTiming}</strong>
          <small className="text-muted">
            {copy.HouseholdSections.enablesStartDateAndPreStartIncomeFields}
          </small>
        </span>
      </label>
      {scenario.firstYear.enabled && (
        <div className={cx(fieldGrid, "mt-6")}>
          <label className={fieldFrame}>
            <span className={standaloneFieldLabel}>{copy.HouseholdSections.calendarYear}</span>
            <input
              type="number"
              value={scenario.firstYear.calendarYear}
              onChange={(event) =>
                patch(["firstYear"], { calendarYear: event.target.valueAsNumber || 2026 })
              }
            />
          </label>
          <TextFactField
            label={copy.HouseholdSections.jobStartDateLabel}
            type="date"
            draft={scenario.firstYear.startDate}
            path={["firstYear", "startDate"]}
            dispatch={dispatch}
          />
          <NumberFactField
            label={copy.HouseholdSections.incomeBeforeStartLabel}
            suffix={copy.HouseholdSections.euroUnit}
            step={0.01}
            min={0}
            draft={scenario.firstYear.incomeBeforeStart}
            path={["firstYear", "incomeBeforeStart"]}
            dispatch={dispatch}
          />
          <NumberFactField
            label={copy.HouseholdSections.withholdingBeforeStartLabel}
            suffix={copy.HouseholdSections.euroUnit}
            step={0.01}
            min={0}
            draft={scenario.firstYear.priorWithholding}
            path={["firstYear", "priorWithholding"]}
            dispatch={dispatch}
          />
          <TextFactField
            label={copy.HouseholdSections.firstPaymentDateLabel}
            type="date"
            draft={scenario.firstYear.firstPaymentDate}
            path={["firstYear", "firstPaymentDate"]}
            dispatch={dispatch}
          />
          <NumberFactField
            label={copy.HouseholdSections.regularPaymentDayLabel}
            step={1}
            min={1}
            draft={scenario.firstYear.regularPaymentDay}
            path={["firstYear", "regularPaymentDay"]}
            dispatch={dispatch}
          />
          <NumberFactField
            label={copy.HouseholdSections.holidayPaymentMonthLabel}
            step={1}
            min={1}
            draft={scenario.firstYear.holidayPaymentMonth}
            path={["firstYear", "holidayPaymentMonth"]}
            dispatch={dispatch}
          />
        </div>
      )}
    </Section>
  );
}
