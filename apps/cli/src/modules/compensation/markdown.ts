import { type CompensationReport, type Money, type Value } from "@nl-compensation/core";

function formatMoney(value: Value<Money>): string {
  if (value.kind === "unknown") return `unavailable (${value.reason})`;
  const amount = (money: Money) =>
    new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" }).format(
      money.amountCents / 100,
    );
  if (value.kind === "exact") return amount(value.value);
  return `${amount(value.min)}–${amount(value.max)}`;
}

export function reportMarkdown(report: CompensationReport): string {
  const lines = [
    `# Compensation report${report.caseId ? ` — ${report.caseId}` : ""}`,
    "",
    `- Guaranteed Annual Cash: ${formatMoney(report.normalization.guaranteedAnnualCash)}`,
    `- GAC at 40 hours: ${formatMoney(report.normalization.guaranteedAnnualCashAt40Hours)}`,
    `- Expected variable cash: ${formatMoney(report.normalization.expectedVariableCash)}`,
    `- Final annual income tax: ${formatMoney(report.fiscalPayroll.finalIncomeTaxAnnual)}`,
    `- Normal ${report.fiscalPayroll.regularPayPeriod.replace("_", "-")} net salary: ${formatMoney(report.fiscalPayroll.normalPeriodNetSalary)}`,
    `- Normal ${report.fiscalPayroll.regularPayPeriod.replace("_", "-")} bank deposit: ${formatMoney(report.fiscalPayroll.normalPeriodNetToBank)}`,
    `- Annual net through payroll: ${formatMoney(report.fiscalPayroll.annualNetThroughPayroll)}`,
    `- Annual net after estimated settlement: ${formatMoney(report.fiscalPayroll.annualNetAfterSettlement)}`,
    `- Average monthly net: ${formatMoney(report.fiscalPayroll.averageMonthlyNet)}`,
    `- Steady-state zorgtoeslag: ${formatMoney(report.household.steadyState.zorgtoeslagAnnual)}`,
    `- Steady-state huurtoeslag: ${formatMoney(report.household.steadyState.huurtoeslagAnnual)}`,
    "",
    "## Completeness",
    "",
    ...report.completeness.map(
      (item) =>
        `- ${item.layer}: ${item.precision}; missing: ${item.missingInputs.join(", ") || "none"}; unsupported: ${item.unsupportedReasons.join(", ") || "none"}`,
    ),
    "",
    `Rules: ${report.selectedRules.bundleId} (${report.selectedRules.bundleContentHash})`,
    `Calculated at: ${report.calculatedAt}`,
  ];
  if (report.limitations.length > 0) {
    lines.push(
      "",
      "## Limitations",
      "",
      ...report.limitations.map((item) => `- ${item.code}: ${item.message}`),
    );
  }
  return `${lines.join("\n")}\n`;
}
