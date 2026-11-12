import { readTrackerJob, patchTrackerJob, type TrackerJob } from "../../infra/tracker.js";
import type { CompensationReport, Money, Value } from "@nl-compensation/core";
import type { StoredCase } from "../../infra/storage.js";
import { AppError } from "../../shared/errors.js";

export const COMPENSATION_META_KEYS = [
  "compensation_case_id",
  "compensation_gac_eur",
  "compensation_gac_40h_eur",
  "compensation_cash_completeness",
  "compensation_ruleset",
] as const;

export interface TrackerPlan {
  readonly jobId: string;
  readonly observedUpdatedAt: string;
  readonly summary: Readonly<Record<(typeof COMPENSATION_META_KEYS)[number], unknown>>;
  readonly mergedMeta: Readonly<Record<string, unknown>>;
}

function exactEuros(value: Value<Money>): number | null {
  return value.kind === "exact" ? value.value.amountCents / 100 : null;
}

function cashCompleteness(report: CompensationReport): string {
  return (
    report.completeness.find((item) => item.layer === "normalization")?.precision ?? "unavailable"
  );
}

export function compactCompensationSummary(
  caseId: string,
  stored: StoredCase,
): TrackerPlan["summary"] {
  return {
    compensation_case_id: caseId,
    compensation_gac_eur: exactEuros(stored.report.normalization.guaranteedAnnualCash),
    compensation_gac_40h_eur: exactEuros(stored.report.normalization.guaranteedAnnualCashAt40Hours),
    compensation_cash_completeness: cashCompleteness(stored.report),
    compensation_ruleset: `${stored.selectedRules.bundleId}@${stored.selectedRules.bundleContentHash}`,
  };
}

export function prepareTrackerPlan(
  job: TrackerJob,
  caseId: string,
  stored: StoredCase,
): TrackerPlan {
  const summary = compactCompensationSummary(caseId, stored);
  return {
    jobId: job.id,
    observedUpdatedAt: job.updatedAt,
    summary,
    mergedMeta: { ...job.meta, ...summary },
  };
}

export async function applyTrackerPlan(
  baseUrl: string,
  plan: TrackerPlan,
  fetcher: typeof fetch = fetch,
): Promise<TrackerJob> {
  const fresh = await readTrackerJob(baseUrl, plan.jobId, fetcher);
  if (fresh.updatedAt !== plan.observedUpdatedAt) {
    throw new AppError(
      "conflict",
      "Job Tracker job changed after preview; refusing to overwrite metadata",
    );
  }
  const freshPlan = { ...fresh.meta, ...plan.summary };
  if (JSON.stringify(freshPlan) !== JSON.stringify(plan.mergedMeta)) {
    throw new AppError(
      "conflict",
      "Job Tracker metadata changed after preview; refusing to overwrite metadata",
    );
  }
  return patchTrackerJob(baseUrl, plan.jobId, plan.mergedMeta, fetcher);
}
