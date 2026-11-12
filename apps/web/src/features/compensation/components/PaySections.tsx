import type { PayPeriod } from "@nl-compensation/core";
import { cx, fieldGrid, textButton } from "../../../shared/ui.js";
import { copy } from "../copy.js";
import { ItemHeader, PlainSelect, PlainText, Section } from "./Controls.js";
import { ChoiceFactField, NumberFactField, yesNoOptions } from "./Fields.js";
import { patchScenario, type FormProps } from "./form.js";
const repeatableItem = "border border-line bg-field/48 p-4 [&+&]:mt-4";
const buttonRow = "flex flex-wrap gap-[0.6rem]";
const addButton =
  "mt-4 rounded-control border border-dashed border-dash bg-transparent px-[0.8rem] py-[0.65rem] text-detail font-bold text-pine";

const itemHeader = "mb-4 flex items-center justify-between";
const itemTitle = "text-item font-bold";

const periods: readonly PayPeriod[] = ["monthly", "four_weekly", "hourly", "annual"];

export function SalarySection({ scenario, dispatch }: FormProps) {
  const patch = patchScenario(dispatch);
  return (
    <Section
      number="01"
      title={copy.PaySections.salaryTitle}
      intro={copy.PaySections.salaryIntro}
      help={copy.PaySections.salaryHelp}
    >
      <div className="mt-4">
        {scenario.salaries.map((salary, index) => (
          <article
            className={scenario.salaries.length === 1 ? undefined : repeatableItem}
            key={salary.id}
          >
            {scenario.salaries.length > 1 && (
              <header className={itemHeader}>
                <h3 className={itemTitle}>
                  {index === 0
                    ? copy.PaySections.primarySalaryQuote
                    : copy.PaySections.additionalSalaryQuote(index)}
                </h3>
                {index > 0 && (
                  <button
                    type="button"
                    className="grid size-[1.7rem] place-items-center rounded-full border-0 bg-transparent text-[1.15rem] leading-none text-muted hover:bg-sand hover:text-red"
                    aria-label={copy.PaySections.removeAdditionalSalaryQuoteAccessibleName(index)}
                    title={copy.PaySections.removeSalaryQuoteTitle}
                    onClick={() => dispatch({ type: "remove-salary", index })}
                  >
                    ×
                  </button>
                )}
              </header>
            )}
            <div className={fieldGrid}>
              <NumberFactField
                label={copy.PaySections.grossSalaryLabel}
                hideLabel
                suffix={copy.PaySections.euroUnit}
                step={0.01}
                min={0}
                draft={salary.amount}
                path={["salaries", index, "amount"]}
                dispatch={dispatch}
              />
              <PlainSelect
                label={copy.PaySections.quotedUnitLabel}
                hideLabel
                value={salary.period}
                options={periods}
                onChange={(period) => patch(["salaries", index], { period })}
              />
            </div>
          </article>
        ))}
      </div>
      <details className="mt-[0.8rem]" open={scenario.salaries.length > 1}>
        <summary className="w-fit cursor-pointer font-mono text-fine text-muted">
          {copy.PaySections.advancedSalaryInput}
        </summary>
        <div className="mt-[0.55rem] max-w-[28rem] bg-sand px-[0.8rem] py-[0.7rem]">
          <p className="mb-[0.45rem] text-small leading-normal text-muted">
            {copy.PaySections.additionalQuoteHelp}
          </p>
          <button
            type="button"
            className={textButton({ flush: true })}
            onClick={() => dispatch({ type: "add-salary" })}
          >
            {copy.PaySections.addAnotherQuotedAmount}
          </button>
        </div>
      </details>
    </Section>
  );
}

export function HolidaySection({ scenario, dispatch }: FormProps) {
  return (
    <Section
      number="02"
      title={copy.PaySections.holidayPayTitle}
      intro={copy.PaySections.holidayPayIntro}
    >
      <div className={fieldGrid}>
        <ChoiceFactField
          label={copy.PaySections.holidayAllowanceInQuotedPayLabel}
          hint={copy.PaySections.holidayAllowanceInQuotedPayHint}
          draft={scenario.holidayInclusion}
          path={["holidayInclusion"]}
          options={[
            { value: "excluded", label: copy.PaySections.paidOnTopLabel },
            { value: "included", label: copy.PaySections.alreadyIncludedLabel },
            { value: "unknown", label: copy.PaySections.termsSayUnknownLabel },
          ]}
          dispatch={dispatch}
        />
        <NumberFactField
          label={copy.PaySections.holidayAllowanceRateLabel}
          suffix="%"
          step={0.01}
          min={0}
          draft={scenario.holidayRate}
          path={["holidayRate"]}
          dispatch={dispatch}
        />
        <ChoiceFactField
          label={copy.PaySections.holidayPayBasisLabel}
          hint={copy.PaySections.holidayPayBasisHint}
          draft={scenario.holidayBasis}
          path={["holidayBasis"]}
          options={[
            { value: "base_salary", label: copy.PaySections.baseSalaryLabel },
            { value: "unknown", label: copy.PaySections.unknownBasisLabel },
          ]}
          dispatch={dispatch}
        />
      </div>
    </Section>
  );
}

export function ThirteenthMonthSection({ scenario, dispatch }: FormProps) {
  const patch = patchScenario(dispatch);
  return (
    <Section
      number="03"
      title={copy.PaySections.thirteenthMonthTitle}
      intro={copy.PaySections.thirteenthMonthIntro}
    >
      <div className={fieldGrid}>
        <ChoiceFactField
          label={copy.PaySections.guaranteed13thMonthOfferedLabel}
          hint={copy.PaySections.guaranteed13thMonthOfferedHint}
          draft={scenario.thirteenthMonth.offered}
          path={["thirteenthMonth", "offered"]}
          options={yesNoOptions}
          dispatch={dispatch}
        />
        {(scenario.thirteenthMonth.offered.mode !== "exact" ||
          scenario.thirteenthMonth.offered.exact) && (
          <>
            <div className="flex min-h-control items-center justify-between gap-4 border border-line bg-white/28 px-3 py-[0.65rem] max-sm:flex-col max-sm:items-start">
              <div className="grid gap-[0.15rem]">
                <strong className="text-[0.74rem]">
                  {scenario.thirteenthMonth.amountMode === "one_base_month"
                    ? copy.PaySections.oneGrossBaseMonth
                    : copy.PaySections.customGrossAmount}
                </strong>
                <span className="text-[0.66rem] text-muted">
                  {scenario.thirteenthMonth.amountMode === "one_base_month"
                    ? copy.PaySections.automaticallyFollowsTheNormalizedBaseSalary
                    : copy.PaySections.customMonthHelp}
                </span>
              </div>
              <button
                type="button"
                className={cx(textButton(), "flex-none")}
                onClick={() =>
                  patch(["thirteenthMonth"], {
                    amountMode:
                      scenario.thirteenthMonth.amountMode === "one_base_month"
                        ? "custom"
                        : "one_base_month",
                  })
                }
              >
                {scenario.thirteenthMonth.amountMode === "one_base_month"
                  ? copy.PaySections.useCustomAmount
                  : copy.PaySections.useOneGrossBaseMonth}
              </button>
            </div>
            {scenario.thirteenthMonth.amountMode === "custom" && (
              <NumberFactField
                label={copy.PaySections.custom13thMonthGrossAmountLabel}
                suffix={copy.PaySections.euroYearUnit}
                step={0.01}
                min={0}
                draft={scenario.thirteenthMonth.amount}
                path={["thirteenthMonth", "amount"]}
                dispatch={dispatch}
              />
            )}
            <ChoiceFactField
              label={copy.PaySections.alreadyIncludedInSalaryQuoteLabel}
              draft={scenario.thirteenthMonth.includedInQuotedPay}
              path={["thirteenthMonth", "includedInQuotedPay"]}
              options={yesNoOptions}
              dispatch={dispatch}
            />
          </>
        )}
      </div>
    </Section>
  );
}

export function IkbSection({ scenario, dispatch }: FormProps) {
  const patch = patchScenario(dispatch);
  return (
    <Section number="06" title={copy.PaySections.ikbTitle} intro={copy.PaySections.ikbIntro}>
      {scenario.ikb.map((item, index) => (
        <article className={repeatableItem} key={item.id}>
          <ItemHeader
            title={copy.PaySections.ikbComponentTitle(index + 1)}
            onRemove={() => dispatch({ type: "remove-item", collection: "ikb", index })}
          />
          <div className={fieldGrid}>
            <PlainSelect
              label={copy.PaySections.componentTypeLabel}
              value={item.kind}
              options={["holiday_allowance", "year_end_payment", "other"]}
              onChange={(kind) => patch(["ikb", index], { kind })}
            />
            <NumberFactField
              label={copy.PaySections.rateLabel}
              suffix="%"
              step={0.01}
              min={0}
              draft={item.rate}
              path={["ikb", index, "rate"]}
              dispatch={dispatch}
            />
            <ChoiceFactField
              label={copy.PaySections.includedInQuotedPayLabel}
              draft={item.includedInQuotedPay}
              path={["ikb", index, "includedInQuotedPay"]}
              options={yesNoOptions}
              dispatch={dispatch}
            />
            <ChoiceFactField
              label={copy.PaySections.guaranteedLabel}
              draft={item.guaranteed}
              path={["ikb", index, "guaranteed"]}
              options={yesNoOptions}
              dispatch={dispatch}
            />
          </div>
        </article>
      ))}
      <button type="button" className={addButton} onClick={() => dispatch({ type: "add-ikb" })}>
        {copy.PaySections.addIKBComponent}
      </button>
    </Section>
  );
}

export function CashSection({ scenario, dispatch }: FormProps) {
  const patch = patchScenario(dispatch);
  return (
    <Section
      number="07"
      title={copy.PaySections.guaranteedVariableCashTitle}
      intro={copy.PaySections.guaranteedVariableCashIntro}
    >
      {scenario.cash.map((item, index) => (
        <article className={repeatableItem} key={item.id}>
          <ItemHeader
            title={copy.PaySections.cashTitle(item.category === "guaranteed", index + 1)}
            onRemove={() => dispatch({ type: "remove-item", collection: "cash", index })}
          />
          <div className={fieldGrid}>
            <PlainText
              label={copy.PaySections.labelLabel}
              value={item.label}
              onChange={(label) => patch(["cash", index], { label })}
            />
            <PlainSelect
              label={copy.PaySections.payUnitLabel}
              value={item.period}
              options={periods}
              onChange={(period) => patch(["cash", index], { period })}
            />
            <NumberFactField
              label={copy.PaySections.amountLabel}
              suffix={copy.PaySections.euroUnit}
              step={0.01}
              min={0}
              draft={item.amount}
              path={["cash", index, "amount"]}
              dispatch={dispatch}
            />
            {item.category === "variable" && (
              <NumberFactField
                label={copy.PaySections.expectedProbabilityLabel}
                suffix="%"
                step={1}
                min={0}
                draft={item.probability}
                path={["cash", index, "probability"]}
                dispatch={dispatch}
              />
            )}
            <ChoiceFactField
              label={copy.PaySections.includedInQuotedPayLabel}
              draft={item.includedInQuotedPay}
              path={["cash", index, "includedInQuotedPay"]}
              options={yesNoOptions}
              dispatch={dispatch}
            />
          </div>
        </article>
      ))}
      <div className={buttonRow}>
        <button
          type="button"
          className={addButton}
          onClick={() => dispatch({ type: "add-cash", category: "guaranteed" })}
        >
          {copy.PaySections.guaranteedCash}
        </button>
        <button
          type="button"
          className={addButton}
          onClick={() => dispatch({ type: "add-cash", category: "variable" })}
        >
          {copy.PaySections.variableCash}
        </button>
      </div>
    </Section>
  );
}
