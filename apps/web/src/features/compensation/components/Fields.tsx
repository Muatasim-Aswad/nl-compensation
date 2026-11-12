import type { EvidenceStatus, FactOrigin, UnknownReason } from "@nl-compensation/core";
import { useId, type ReactNode } from "react";
import { HelpTip } from "../../../shared/HelpTip.js";
import { checkbox, fieldFrame, fieldLabel, valueShapeRow } from "../../../shared/ui.js";
import { copy } from "../copy.js";
import {
  type ChoiceFactDraft,
  type DraftPath,
  type NumberFactDraft,
  type ScenarioAction,
} from "../scenario.js";

type Dispatch = (action: ScenarioAction) => void;

const origins: readonly FactOrigin[] = [
  "listing",
  "recruiter",
  "offer",
  "contract",
  "user",
  "government_rule",
  "derived",
];
const evidenceStates: readonly EvidenceStatus[] = ["explicit", "inferred", "assumed"];
const unknownReasons: readonly UnknownReason[] = ["not_provided", "not_known", "not_applicable"];

const metaLabel = "text-meta text-muted";
const metaSelect = "mt-1 min-h-[34px] p-[0.35rem] text-caption";
const rangeCaption = "mb-[0.2rem] block text-meta text-muted";
const rangeAside = "mb-[0.8rem] font-mono text-meta text-muted";

function pretty(value: string): string {
  return copy.options[value as keyof typeof copy.options] ?? copy.Controls.unknown;
}

interface FrameProps {
  readonly label: string;
  readonly hint?: string;
  readonly hideLabel?: boolean;
  readonly id: string;
  readonly children: ReactNode;
}

function FieldFrame({ label, hint, hideLabel = false, id, children }: FrameProps) {
  return (
    <div className={fieldFrame}>
      {hideLabel ? (
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
      ) : (
        <div className="mb-[0.38rem] flex min-h-[1.35rem] items-center gap-[0.4rem]">
          <label className={fieldLabel} htmlFor={id}>
            {label}
          </label>
          {hint && <HelpTip label={copy.Fields.moreInformationLabel(label)}>{hint}</HelpTip>}
        </div>
      )}
      {children}
    </div>
  );
}

function FactMeta({
  draft,
  path,
  dispatch,
}: {
  readonly draft: NumberFactDraft | ChoiceFactDraft<string | boolean>;
  readonly path: DraftPath;
  readonly dispatch: Dispatch;
}) {
  return (
    <details className="mt-[0.42rem]">
      <summary className="cursor-pointer font-mono text-meta text-muted">
        {copy.Fields.evidenceSummary(
          pretty(draft.origin),
          pretty(draft.evidenceStatus),
          draft.locked,
        )}
      </summary>
      <div className="mt-[0.55rem] grid grid-cols-2 gap-[0.6rem] bg-sand p-[0.7rem]">
        <label className={metaLabel}>
          {copy.Fields.source}
          <select
            className={metaSelect}
            value={draft.origin}
            onChange={(event) =>
              dispatch({ type: "patch", path, patch: { origin: event.target.value } })
            }
          >
            {origins.map((origin) => (
              <option key={origin} value={origin}>
                {pretty(origin)}
              </option>
            ))}
          </select>
        </label>
        <label className={metaLabel}>
          {copy.Fields.evidence2}
          <select
            className={metaSelect}
            value={draft.evidenceStatus}
            onChange={(event) =>
              dispatch({ type: "patch", path, patch: { evidenceStatus: event.target.value } })
            }
          >
            {evidenceStates.map((evidence) => (
              <option key={evidence} value={evidence}>
                {pretty(evidence)}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-full flex items-center gap-[0.45rem] text-meta text-ink">
          <input
            type="checkbox"
            className={checkbox}
            checked={draft.locked}
            onChange={(event) =>
              dispatch({ type: "patch", path, patch: { locked: event.target.checked } })
            }
          />
          {copy.Fields.lockThisFact}
        </label>
      </div>
    </details>
  );
}

interface NumberFactFieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly hideLabel?: boolean;
  readonly suffix?: string;
  readonly step?: number;
  readonly min?: number;
  readonly draft: NumberFactDraft;
  readonly path: DraftPath;
  readonly dispatch: Dispatch;
}

export function NumberFactField({
  label,
  hint,
  hideLabel,
  suffix,
  step = 1,
  min,
  draft,
  path,
  dispatch,
}: NumberFactFieldProps) {
  const id = useId();
  const patch = (value: Readonly<Record<string, unknown>>) =>
    dispatch({ type: "patch", path, patch: value });
  return (
    <FieldFrame label={label} hint={hint} hideLabel={hideLabel} id={id}>
      <div className={valueShapeRow}>
        <select
          id={id}
          aria-label={copy.Fields.valueShapeAccessibleName(label)}
          value={draft.mode}
          onChange={(event) => patch({ mode: event.target.value })}
        >
          <option value="exact">{copy.Fields.exact}</option>
          <option value="range">{copy.Fields.range}</option>
          <option value="unknown">{copy.Fields.unknown}</option>
        </select>
        {draft.mode === "exact" && (
          <label className="relative flex">
            <span className="sr-only">{label}</span>
            <input
              type="number"
              className="pr-[3.6rem]"
              value={draft.exact}
              step={step}
              min={min}
              onChange={(event) => patch({ exact: event.target.valueAsNumber || 0 })}
            />
            {suffix && (
              <span className="pointer-events-none absolute top-1/2 right-[0.65rem] -translate-y-1/2 font-mono text-meta text-muted">
                {suffix}
              </span>
            )}
          </label>
        )}
        {draft.mode === "range" && (
          <div className="col-span-full grid grid-cols-[1fr_auto_1fr_auto] items-end gap-[0.45rem]">
            <label>
              <span className={rangeCaption}>{copy.Fields.from}</span>
              <input
                type="number"
                value={draft.min}
                step={step}
                min={min}
                onChange={(event) => patch({ min: event.target.valueAsNumber || 0 })}
              />
            </label>
            <span className={rangeAside} aria-hidden="true">
              —
            </span>
            <label>
              <span className={rangeCaption}>{copy.Fields.to}</span>
              <input
                type="number"
                value={draft.max}
                step={step}
                min={min}
                onChange={(event) => patch({ max: event.target.valueAsNumber || 0 })}
              />
            </label>
            {suffix && <span className={rangeAside}>{suffix}</span>}
          </div>
        )}
        {draft.mode === "unknown" && (
          <select
            aria-label={copy.Fields.unknownReasonAccessibleName(label)}
            value={draft.unknownReason}
            onChange={(event) => patch({ unknownReason: event.target.value })}
          >
            {unknownReasons.map((reason) => (
              <option key={reason} value={reason}>
                {pretty(reason)}
              </option>
            ))}
          </select>
        )}
      </div>
      <FactMeta draft={draft} path={path} dispatch={dispatch} />
    </FieldFrame>
  );
}

interface ChoiceOption<T extends string | boolean> {
  readonly value: T;
  readonly label: string;
}

export function ChoiceFactField<T extends string | boolean>({
  label,
  hint,
  draft,
  path,
  options,
  dispatch,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly draft: ChoiceFactDraft<T>;
  readonly path: DraftPath;
  readonly options: readonly ChoiceOption<T>[];
  readonly dispatch: Dispatch;
}) {
  const id = useId();
  const patch = (value: Readonly<Record<string, unknown>>) =>
    dispatch({ type: "patch", path, patch: value });
  return (
    <FieldFrame label={label} hint={hint} id={id}>
      <div className={valueShapeRow}>
        <select
          id={id}
          value={draft.mode}
          aria-label={copy.Fields.valueShapeAccessibleName(label)}
          onChange={(event) => patch({ mode: event.target.value })}
        >
          <option value="exact">{copy.Fields.known}</option>
          <option value="unknown">{copy.Fields.unknown}</option>
        </select>
        {draft.mode === "exact" ? (
          <select
            aria-label={label}
            value={String(draft.exact)}
            onChange={(event) => {
              const option = options.find(
                (candidate) => String(candidate.value) === event.target.value,
              );
              if (option) patch({ exact: option.value });
            }}
          >
            {options.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <select
            aria-label={copy.Fields.unknownReasonAccessibleName(label)}
            value={draft.unknownReason}
            onChange={(event) => patch({ unknownReason: event.target.value })}
          >
            {unknownReasons.map((reason) => (
              <option key={reason} value={reason}>
                {pretty(reason)}
              </option>
            ))}
          </select>
        )}
      </div>
      <FactMeta
        draft={draft as ChoiceFactDraft<string | boolean>}
        path={path}
        dispatch={dispatch}
      />
    </FieldFrame>
  );
}

export function TextFactField({
  label,
  draft,
  path,
  dispatch,
  type = "text",
}: {
  readonly label: string;
  readonly draft: ChoiceFactDraft<string>;
  readonly path: DraftPath;
  readonly dispatch: Dispatch;
  readonly type?: "text" | "date";
}) {
  const id = useId();
  const patch = (value: Readonly<Record<string, unknown>>) =>
    dispatch({ type: "patch", path, patch: value });
  return (
    <FieldFrame label={label} id={id}>
      <div className={valueShapeRow}>
        <select
          id={id}
          value={draft.mode}
          aria-label={copy.Fields.valueShapeAccessibleName(label)}
          onChange={(event) => patch({ mode: event.target.value })}
        >
          <option value="exact">{copy.Fields.known}</option>
          <option value="unknown">{copy.Fields.unknown}</option>
        </select>
        {draft.mode === "exact" ? (
          <input
            type={type}
            aria-label={label}
            value={draft.exact}
            onChange={(event) => patch({ exact: event.target.value })}
          />
        ) : (
          <select
            aria-label={copy.Fields.unknownReasonAccessibleName(label)}
            value={draft.unknownReason}
            onChange={(event) => patch({ unknownReason: event.target.value })}
          >
            {unknownReasons.map((reason) => (
              <option key={reason} value={reason}>
                {pretty(reason)}
              </option>
            ))}
          </select>
        )}
      </div>
      <FactMeta draft={draft} path={path} dispatch={dispatch} />
    </FieldFrame>
  );
}

export const yesNoOptions = [
  { value: true, label: copy.Fields.yesLabel },
  { value: false, label: copy.Fields.noLabel },
] as const;
