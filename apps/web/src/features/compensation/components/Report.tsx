import {
  eur,
  type CompensationReport,
  type Money,
  type NormalizationOutcome,
  type NormalizationReport,
  type Value,
} from "@nl-compensation/core";
import { BUNDLE_2026, ruleSelectionFor } from "@nl-compensation/rules-nl";
import type { ReactNode } from "react";
import { HelpTip } from "../../../shared/HelpTip.js";
import {
  cx,
  disclosureParagraph,
  disclosureSummary,
  disclosureText,
  eyebrow,
  panel,
  panelTitle,
  sectionTitle,
  subheading,
} from "../../../shared/ui.js";
import { copy } from "../copy.js";
import { formatMoneyValue, labelPath } from "../format.js";

const reportSection = cx(panel(), "mt-4");
const sectionHeading = "flex items-start justify-between gap-6";
const titleWithHelp = "flex items-center gap-[0.45rem]";
const metricGrid = "mt-[1.6rem] grid grid-cols-2 gap-[0.8rem] max-sm:grid-cols-1";
const cardGrid = "mt-4 grid grid-cols-2 gap-[0.8rem] max-sm:grid-cols-1";
const cardTitle = "text-detail font-bold capitalize";
const evidenceDetails = "border-b border-line py-[0.8rem] last:border-b-0";
const evidenceList = "my-4 pl-[1.2rem]";
const definitionRow = "flex justify-between gap-4 py-[0.65rem]";
const definitionTerm = "text-small";
const definitionValue = "text-right font-mono text-small";
const periodRow = cx(definitionRow, "border-b border-line");
const completenessCard = "grid content-start gap-[0.65rem] border border-line p-4";
const completenessNote = "text-fine leading-normal text-muted";

const precisionTones: Readonly<Record<string, string>> = {
  estimated: "bg-estimated-bg text-estimated",
  unavailable: "bg-unavailable-bg text-unavailable",
  unsupported: "bg-unavailable-bg text-unavailable",
};

function Precision({ value }: { readonly value: string }) {
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center rounded-full px-[0.48rem] py-[0.28rem] font-mono text-[0.6rem] font-medium uppercase",
        precisionTones[value] ?? "bg-pine-light text-pine",
      )}
    >
      {value}
    </span>
  );
}

function MetricCard({
  label,
  display,
  supporting,
  compact = false,
}: {
  readonly label: string;
  readonly display: string;
  readonly supporting?: string;
  readonly compact?: boolean;
}) {
  return (
    <article
      className={cx("min-w-0 border-l-3 border-orange bg-stone", compact ? "p-[0.8rem]" : "p-4")}
    >
      <div className="mb-2 flex min-h-[1.2rem] items-center gap-[0.45rem]">
        <p className="text-caption text-muted">{label}</p>
        {supporting && <HelpTip label={copy.Report.explanationLabel(label)}>{supporting}</HelpTip>}
      </div>
      <strong
        className={cx(
          "block font-mono leading-[1.1] font-medium tracking-[-0.06em] wrap-anywhere",
          compact ? "text-[clamp(1.05rem,1.7vw,1.55rem)]" : "text-[clamp(1.2rem,2.1vw,2rem)]",
        )}
      >
        {display}
      </strong>
    </article>
  );
}

function Metric({
  label,
  value,
  supporting,
  roundToWholeEuro = false,
  compact = false,
}: {
  readonly label: string;
  readonly value: Value<Money>;
  readonly supporting?: string;
  readonly roundToWholeEuro?: boolean;
  readonly compact?: boolean;
}) {
  return (
    <MetricCard
      label={label}
      display={formatMoneyValue(value, roundToWholeEuro)}
      supporting={supporting}
      compact={compact}
    />
  );
}

function EmptyLayer({ children }: { readonly children: string }) {
  return <p className="mt-4 bg-stone p-4 text-detail leading-prose text-muted">{children}</p>;
}

function SupplementalBenefits({ children }: { readonly children: ReactNode }) {
  return <ul className="mt-[0.85rem] border-t border-line pt-[0.75rem] text-muted">{children}</ul>;
}

function SupplementalBenefit({
  label,
  explanation,
  display,
}: {
  readonly label: string;
  readonly explanation: string;
  readonly display: string;
}) {
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-[0.45rem] before:text-orange before:content-['•']">
      <div className="inline-flex items-center gap-[0.4rem]">
        <span>{label}</span>
        <HelpTip label={copy.Report.explanationLabel(label)} placement="inline">
          {explanation}
        </HelpTip>
      </div>
      <strong className="font-mono text-[0.88rem] font-medium tracking-[-0.03em] text-ink">
        {display}
      </strong>
    </li>
  );
}

function divideMoney(value: Value<Money>, divisor: number): Value<Money> {
  if (value.kind === "unknown") return value;
  if (value.kind === "exact")
    return { kind: "exact", value: eur(Math.round(value.value.amountCents / divisor)) };
  return {
    kind: "range",
    min: eur(Math.round(value.min.amountCents / divisor)),
    max: eur(Math.round(value.max.amountCents / divisor)),
    correlationId: value.correlationId,
  };
}

function annualBaseFrom(normalized: NormalizationReport): Value<Money> {
  return (
    normalized.guaranteedBreakdown.find((item) => item.componentId === "base_salary")
      ?.annualAmount ?? ({ kind: "unknown", reason: "not_known" } as const)
  );
}

function isAvailableMoney(value: Value<Money>): boolean {
  return value.kind !== "unknown";
}

export function NonCashBenefits({
  benefits,
}: {
  readonly benefits: CompensationReport["nonCash"]["benefits"];
}) {
  const availableBenefits = benefits.filter((benefit) => isAvailableMoney(benefit.value));
  if (availableBenefits.length === 0) return null;
  return (
    <SupplementalBenefits>
      {availableBenefits.map((benefit) => (
        <SupplementalBenefit
          key={benefit.id}
          label={benefit.label}
          explanation={copy.Report.nonCashBenefitExplanation}
          display={formatMoneyValue(benefit.value)}
        />
      ))}
    </SupplementalBenefits>
  );
}

export function DecisionSummary({
  normalized,
  report,
  show40HourEquivalent,
}: {
  readonly normalized: NormalizationReport;
  readonly report?: CompensationReport;
  readonly show40HourEquivalent: boolean;
}) {
  const annualBase = annualBaseFrom(normalized);
  const averageMonthlyGross = divideMoney(normalized.guaranteedAnnualCash, 12);
  const averageMonthlyNet = report?.fiscalPayroll.averageMonthlyNet;
  const educationBudget = report?.nonCash.benefits.find(
    (benefit) => benefit.id === "education-budget",
  )?.value;

  return (
    <>
      <div className="mt-[1.1rem] grid grid-cols-2 gap-[0.55rem] max-sm:grid-cols-1">
        {show40HourEquivalent && isAvailableMoney(normalized.guaranteedAnnualCashAt40Hours) && (
          <Metric
            label={copy.Report.fortyHourEquivalentGrossLabel}
            value={normalized.guaranteedAnnualCashAt40Hours}
            supporting={copy.Report.fortyHourEquivalentGrossExplanation}
            roundToWholeEuro
            compact
          />
        )}
        {isAvailableMoney(normalized.guaranteedAnnualCash) && (
          <Metric
            label={copy.Report.guaranteedAnnualGrossLabel}
            value={normalized.guaranteedAnnualCash}
            supporting={copy.Report.guaranteedAnnualGrossExplanation}
            roundToWholeEuro
            compact
          />
        )}
        {isAvailableMoney(annualBase) && (
          <Metric
            label={copy.Report.annualBaseGrossLabel}
            value={annualBase}
            roundToWholeEuro
            compact
          />
        )}
        {report && isAvailableMoney(report.fiscalPayroll.annualNetAfterSettlement) && (
          <Metric
            label={copy.Report.estimatedAnnualNetAfterSettlementLabel}
            value={report.fiscalPayroll.annualNetAfterSettlement}
            supporting={copy.Report.estimatedAnnualNetAfterSettlementExplanation}
            roundToWholeEuro
            compact
          />
        )}
        {isAvailableMoney(averageMonthlyGross) && (
          <Metric
            label={copy.Report.averageMonthlyGrossLabel}
            value={averageMonthlyGross}
            supporting={copy.Report.averageMonthlyGrossExplanation}
            roundToWholeEuro
            compact
          />
        )}
        {averageMonthlyNet && isAvailableMoney(averageMonthlyNet) && (
          <Metric
            label={copy.Report.averageMonthlyNetLabel}
            value={averageMonthlyNet}
            supporting={copy.Report.averageMonthlyNetExplanation}
            roundToWholeEuro
            compact
          />
        )}
      </div>
      {educationBudget && isAvailableMoney(educationBudget) && (
        <SupplementalBenefits>
          <SupplementalBenefit
            label={copy.Report.annualEducationBudgetLabel}
            explanation="Employer-provided annual non-cash budget. It is excluded from salary, guaranteed annual gross and net income."
            display={formatMoneyValue(educationBudget, true)}
          />
        </SupplementalBenefits>
      )}
    </>
  );
}

export function Report({
  normalization,
  report,
  show40HourEquivalent,
}: {
  readonly normalization: NormalizationOutcome;
  readonly report?: CompensationReport;
  readonly show40HourEquivalent: boolean;
}) {
  const rules = report?.selectedRules ?? ruleSelectionFor(BUNDLE_2026);
  const normalized = normalization.report;
  const annualBase =
    normalized.guaranteedBreakdown.find((item) => item.componentId === "base_salary")
      ?.annualAmount ?? ({ kind: "unknown", reason: "not_known" } as const);
  return (
    <div
      className="px-[3.5vw] py-[clamp(2rem,3.5vw,4rem)] max-sm:px-4 max-sm:py-6"
      aria-live="polite"
    >
      <section className={panel()} aria-labelledby="report-title">
        <div className={sectionHeading}>
          <div>
            <p className={eyebrow}>{copy.Report.decisionSummary}</p>
            <h2 id="report-title" className={sectionTitle}>
              {copy.Report.offerAtAGlance}
            </h2>
          </div>
          <Precision value={normalized.precision} />
        </div>
        <DecisionSummary
          normalized={normalized}
          report={report}
          show40HourEquivalent={show40HourEquivalent}
        />
      </section>

      {normalization.diagnostics.length > 0 && (
        <section className={cx(panel("attention"), "mt-4")} aria-labelledby="attention-title">
          <p className={eyebrow}>{copy.Report.needsAttention}</p>
          <h2 id="attention-title" className={panelTitle}>
            {copy.Report.resolveTheseFacts}
          </h2>
          <ul className="mt-4 list-disc pl-5">
            {normalization.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`} className="not-first:mt-3">
                <strong className="block text-subhead">{diagnostic.message}</strong>
                <span className="mt-[0.2rem] block text-[0.67rem] text-attention-copy">
                  {copy.Report.resolutionReview}{" "}
                  {"paths" in diagnostic
                    ? diagnostic.paths.map(labelPath).join(" and ")
                    : diagnostic.expressionIndexes
                        .map((item) => copy.Report.salaryEntry(item + 1))
                        .join(" and ")}
                  {diagnostic.code === "locked_salary_conflict"
                    ? copy.Report.resolutionAdvice
                    : "."}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={reportSection} aria-labelledby="derived-title">
        <div className={sectionHeading}>
          <div>
            <p className={eyebrow}>{copy.Report.quoteAndBase}</p>
            <div className={titleWithHelp}>
              <h2 id="derived-title" className={sectionTitle}>
                {copy.Report.salaryUnits}
              </h2>
              <HelpTip label={copy.Report.salaryUnitsExplanationLabel} placement="inline">
                {copy.Report.salaryUnitsHelp}
              </HelpTip>
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px border border-line bg-line">
          {normalization.salarySolution.representations.map((representation) => (
            <div key={representation.period} className="grid gap-[0.35rem] bg-paper p-[0.8rem]">
              <span className="text-meta text-muted capitalize">
                {representation.period.replace("_", " ")}
              </span>
              <strong className="font-mono text-[0.85rem] font-medium">
                {formatMoneyValue(representation.amount)}
              </strong>
            </div>
          ))}
          {normalization.salarySolution.representations.length === 0 && (
            <EmptyLayer>{copy.Report.missingSalary}</EmptyLayer>
          )}
        </div>
        <div className={metricGrid}>
          <Metric label={copy.Report.normalizedAnnualBaseLabel} value={annualBase} />
          <Metric
            label={copy.Report.baseGrossPerMonthLabel}
            value={divideMoney(annualBase, 12)}
            supporting={copy.Report.baseGrossPerMonthExplanation}
          />
        </div>
      </section>

      <section className={reportSection} aria-labelledby="breakdown-title">
        <div className={sectionHeading}>
          <div>
            <p className={eyebrow}>{copy.Report.cashStructure}</p>
            <h2 id="breakdown-title" className={sectionTitle}>
              {copy.Report.guaranteedBreakdown}
            </h2>
          </div>
        </div>
        <dl className="mt-5">
          {normalized.guaranteedBreakdown.map((item) => (
            <div key={item.componentId} className={periodRow}>
              <dt className={definitionTerm}>{item.label}</dt>
              <dd className={definitionValue}>{formatMoneyValue(item.annualAmount)}</dd>
            </div>
          ))}
          <div className={cx(definitionRow, "mt-[0.4rem] text-muted")}>
            <dt className={definitionTerm}>{copy.Report.expectedVariableCash}</dt>
            <dd className={definitionValue}>{formatMoneyValue(normalized.expectedVariableCash)}</dd>
          </div>
        </dl>
      </section>

      <section className={reportSection} aria-labelledby="net-title">
        <div className={sectionHeading}>
          <div>
            <p className={eyebrow}>{copy.Report.fiscalPayroll}</p>
            <div className={titleWithHelp}>
              <h2 id="net-title" className={sectionTitle}>
                {copy.Report.annualAndMonthlyNet}
              </h2>
              {report && (
                <HelpTip
                  label={copy.Report.normalPeriodPayslipEstimateExplanationLabel}
                  placement="inline"
                >
                  {copy.Report.payslipExplanation(
                    formatMoneyValue(report.fiscalPayroll.normalPeriodGross),
                    formatMoneyValue(report.fiscalPayroll.normalPeriodPreTaxDeduction),
                    formatMoneyValue(report.fiscalPayroll.payrollWithholdingRegular),
                    formatMoneyValue(report.fiscalPayroll.normalPeriodAdditionalWithholding),
                    formatMoneyValue(report.fiscalPayroll.normalPeriodPostTaxDeduction),
                  )}
                </HelpTip>
              )}
            </div>
          </div>
          {report && <Precision value={report.fiscalPayroll.precision} />}
        </div>
        {report ? (
          <>
            <div className={metricGrid}>
              <Metric
                label={copy.Report.normalNetSalaryLabel(
                  copy.options[report.fiscalPayroll.regularPayPeriod],
                )}
                value={report.fiscalPayroll.normalPeriodNetSalary}
                supporting={copy.Report.normalNetSalaryExplanation}
              />
              <Metric
                label={copy.Report.normalBankDepositLabel(
                  copy.options[report.fiscalPayroll.regularPayPeriod],
                )}
                value={report.fiscalPayroll.normalPeriodNetToBank}
                supporting={copy.Report.normalBankDepositExplanation}
              />
              <Metric
                label={copy.Report.annualNetPaidThroughPayrollLabel}
                value={report.fiscalPayroll.annualNetThroughPayroll}
                supporting={copy.Report.annualNetPaidThroughPayrollExplanation}
              />
              <Metric
                label={copy.Report.annualNetAfterEstimatedSettlementLabel}
                value={report.fiscalPayroll.annualNetAfterSettlement}
                supporting={copy.Report.estimatedAnnualNetAfterSettlementExplanation}
              />
              <Metric
                label={copy.Report.averageMonthlyNetLabel}
                value={report.fiscalPayroll.averageMonthlyNet}
                supporting={copy.Report.averageMonthlyNetExplanation}
              />
              <Metric
                label={copy.Report.possibleTaxSettlementLabel}
                value={report.fiscalPayroll.possibleSettlement}
                supporting={copy.Report.possibleTaxSettlementExplanation}
              />
            </div>
            {report.fiscalPayroll.specialPayments.length > 0 && (
              <>
                <h3 className={subheading}>{copy.Report.periodsWithSpecialPayments}</h3>
                <div className={metricGrid}>
                  {report.fiscalPayroll.specialPayments.map((payment) => (
                    <Metric
                      key={payment.componentId}
                      label={copy.Report.periodBankDepositLabel(payment.label)}
                      value={payment.estimatedPeriodNetToBank}
                      supporting={copy.Report.periodBankDepositExplanation(
                        formatMoneyValue(payment.gross),
                        formatMoneyValue(payment.withholding),
                        formatMoneyValue(payment.netPayment),
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <EmptyLayer>{copy.Report.calculationPending}</EmptyLayer>
        )}
      </section>

      <section className={reportSection} aria-labelledby="household-title">
        <div className={sectionHeading}>
          <div>
            <p className={eyebrow}>{copy.Report.householdOutcome}</p>
            <div className={titleWithHelp}>
              <h2 id="household-title" className={sectionTitle}>
                {copy.Report.allowancesSpendableIncome}
              </h2>
              <HelpTip label={copy.Report.dutchAllowanceTermsExplanationLabel} placement="inline">
                {copy.Report.allowanceHelp}
              </HelpTip>
            </div>
          </div>
        </div>
        {report ? (
          <div className={cardGrid}>
            {report.household.firstCalendarYear && (
              <PeriodReport
                title={copy.Report.firstCalendarYearTitle}
                period={report.household.firstCalendarYear}
              />
            )}
            <PeriodReport
              title={copy.Report.steadyStateTitle}
              period={report.household.steadyState}
            />
          </div>
        ) : (
          <EmptyLayer>{copy.Report.householdPending}</EmptyLayer>
        )}
      </section>

      <section className={reportSection} aria-labelledby="package-title">
        <div className={sectionHeading}>
          <div>
            <p className={eyebrow}>{copy.Report.wholePackage}</p>
            <h2 id="package-title" className={sectionTitle}>
              {copy.Report.nonCashCompleteness}
            </h2>
          </div>
        </div>
        {report ? (
          <>
            <div className={metricGrid}>
              <Metric
                label={copy.Report.employerPensionContributionLabel}
                value={report.nonCash.pensionEmployerContribution}
              />
              <MetricCard
                label={copy.Report.paidLeaveLabel}
                display={
                  report.nonCash.paidLeaveDays.kind === "exact"
                    ? `${report.nonCash.paidLeaveDays.value} days`
                    : copy.formatting.unavailable
                }
              />
            </div>
            <NonCashBenefits benefits={report.nonCash.benefits} />
            <div className={cardGrid}>
              {report.completeness.map((item) => (
                <article key={item.layer} className={completenessCard}>
                  <h3 className={cardTitle}>{item.layer.replace("_", " ")}</h3>
                  <Precision value={item.precision} />
                  {item.missingInputs.length > 0 && (
                    <p className={completenessNote}>
                      {copy.Report.missing(item.missingInputs.map(labelPath).join(", "))}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className={cardGrid}>
            <article className={completenessCard}>
              <h3 className={cardTitle}>{copy.Report.normalization}</h3>
              <Precision value={normalization.completeness.precision} />
              {normalization.completeness.missingInputs.length > 0 && (
                <p className={completenessNote}>
                  {copy.Report.missing(
                    normalization.completeness.missingInputs.map(labelPath).join(", "),
                  )}
                </p>
              )}
            </article>
          </div>
        )}
      </section>

      <section className={reportSection} aria-labelledby="evidence-title">
        <div className={sectionHeading}>
          <div>
            <p className={eyebrow}>{copy.Report.auditTrail}</p>
            <h2 id="evidence-title" className={sectionTitle}>
              {copy.Report.assumptionsLimitsRules}
            </h2>
          </div>
        </div>
        <details className={evidenceDetails} open={Boolean(report?.limitations.length)}>
          <summary className={disclosureSummary}>
            {copy.Report.limitations(report?.limitations.length ?? 0)}
          </summary>
          {report?.limitations.length ? (
            <ul className={cx(evidenceList, "list-disc")}>
              {report.limitations.map((item) => (
                <li key={item.code} className={disclosureText}>
                  {item.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className={disclosureParagraph}>{copy.Report.noLimitationsReturnedYet}</p>
          )}
        </details>
        <details className={evidenceDetails}>
          <summary className={disclosureSummary}>
            {copy.Report.assumptions(
              (report?.assumptions.length ?? 0) + normalization.assumptions.length,
            )}
          </summary>
          <ul className={cx(evidenceList, "list-disc")}>
            {[...normalization.assumptions, ...(report?.assumptions ?? [])].map((item) => (
              <li key={item.code} className={disclosureText}>
                {item.message}
              </li>
            ))}
          </ul>
        </details>
        <details className={evidenceDetails}>
          <summary className={disclosureSummary}>{copy.Report.selectedRuleBundle}</summary>
          <p className={disclosureParagraph}>
            <strong>{rules.bundleId}</strong> {copy.Report.contentHash}
            {rules.bundleContentHash.slice(0, 12)}…
          </p>
          <ul className={cx(evidenceList, "list-disc")}>
            {rules.ruleIds.map((rule) => (
              <li key={rule} className={disclosureText}>
                {rule}
              </li>
            ))}
          </ul>
        </details>
        <details className={evidenceDetails}>
          <summary className={disclosureSummary}>
            {copy.Report.derivationDetails(
              (report?.derivationTrace.length ?? 0) + normalization.derivationTrace.length,
            )}
          </summary>
          <ol className={cx(evidenceList, "list-decimal")}>
            {[...normalization.derivationTrace, ...(report?.derivationTrace ?? [])].map((step) => (
              <li key={`${step.id}-${step.outputPath}`} className={disclosureText}>
                <strong>{step.operation}</strong> → {labelPath(step.outputPath)}
                {step.rounding && <span> · {step.rounding}</span>}
              </li>
            ))}
          </ol>
        </details>
      </section>
    </div>
  );
}

function PeriodReport({
  title,
  period,
}: {
  readonly title: string;
  readonly period: CompensationReport["household"]["steadyState"];
}) {
  return (
    <article className="border border-line p-4">
      <header className="flex items-start justify-between gap-2">
        <h3 className={cardTitle}>{title}</h3>
        <Precision value={period.precision} />
      </header>
      <dl className="mt-[0.7rem]">
        <div className={periodRow}>
          <dt className={definitionTerm}>{copy.Report.toetsingsinkomen}</dt>
          <dd className={definitionValue}>{formatMoneyValue(period.toetsingsinkomen)}</dd>
        </div>
        <div className={periodRow}>
          <dt className={definitionTerm}>{copy.Report.zorgtoeslag}</dt>
          <dd className={definitionValue}>{formatMoneyValue(period.zorgtoeslagAnnual)}</dd>
        </div>
        <div className={periodRow}>
          <dt className={definitionTerm}>{copy.Report.huurtoeslag}</dt>
          <dd className={definitionValue}>{formatMoneyValue(period.huurtoeslagAnnual)}</dd>
        </div>
        <div className={periodRow}>
          <dt className={definitionTerm}>{copy.Report.spendableIncome}</dt>
          <dd className={definitionValue}>{formatMoneyValue(period.spendableIncomeAnnual)}</dd>
        </div>
      </dl>
    </article>
  );
}
