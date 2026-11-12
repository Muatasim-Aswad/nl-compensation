import type { ReactNode } from "react";
import { useHelp } from "../../../shared/help.js";
import { HelpTip } from "../../../shared/HelpTip.js";
import { cx, fieldFrame, standaloneFieldLabel, textButton } from "../../../shared/ui.js";
import { copy } from "../copy.js";
import type { NumberFactDraft } from "../scenario.js";
const fastControl = "h-control min-h-control py-[0.42rem] text-detail";
const itemHeader = "mb-4 flex items-center justify-between";
const itemTitle = "text-item font-bold";
export function Section({
  number,
  title,
  intro,
  children,
  open = false,
  help,
}: {
  readonly number: string;
  readonly title: string;
  readonly intro: string;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly help?: string;
}) {
  const tips = useHelp();
  return (
    <div className="relative border-t border-line last:border-b">
      <details
        className="group/section"
        open={open}
        onToggle={(event) => {
          if (event.currentTarget.open && help) tips.show(`${title}: explanation`, true);
        }}
      >
        <summary className="grid cursor-pointer list-none grid-cols-[2.25rem_1fr_auto] items-start gap-3 py-[1.4rem] [&::-webkit-details-marker]:hidden">
          <span className="font-mono text-detail font-medium text-orange">{number}</span>
          <span>
            <strong className="block text-[1rem]">{title}</strong>
            <small className="mt-1 block text-prompt font-normal text-muted">{intro}</small>
          </span>
          <span
            className="text-[1.35rem] text-pine transition-transform duration-160 ease-[ease] group-open/section:rotate-45 motion-reduce:transition-none"
            aria-hidden="true"
          >
            +
          </span>
        </summary>
        <div className="pt-2 pb-10 pl-12 max-sm:pl-0">{children}</div>
      </details>
      {help && (
        <div className="absolute top-[1.4rem] left-[6.6rem] z-3">
          <HelpTip label={copy.Controls.explanationLabel(title)} placement="section">
            {help}
          </HelpTip>
        </div>
      )}
    </div>
  );
}

export function PlainSelect({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  selectClassName,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
  readonly hideLabel?: boolean;
  readonly selectClassName?: string;
}) {
  return (
    <label className={fieldFrame}>
      <span className={hideLabel ? "sr-only" : standaloneFieldLabel}>{label}</span>
      <select
        className={selectClassName}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option value={option} key={option}>
            {copy.options[option as keyof typeof copy.options] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlainText({
  label,
  value,
  onChange,
  type = "text",
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: "text" | "date";
}) {
  return (
    <label className={fieldFrame}>
      <span className={standaloneFieldLabel}>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function ItemHeader({
  title,
  onRemove,
}: {
  readonly title: string;
  readonly onRemove: () => void;
}) {
  return (
    <header className={itemHeader}>
      <h3 className={itemTitle}>{title}</h3>
      <button type="button" className={textButton({ tone: "danger" })} onClick={onRemove}>
        {copy.Controls.remove}
      </button>
    </header>
  );
}

export function FastNumberControl({
  label,
  draft,
  suffix,
  onPatch,
  hideLabel = false,
}: {
  readonly label: string;
  readonly draft: NumberFactDraft;
  readonly suffix: string;
  readonly onPatch: (patch: Readonly<Record<string, unknown>>) => void;
  readonly hideLabel?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className={hideLabel ? "sr-only" : "mb-1 block text-caption font-bold text-label"}>
        {label}
      </span>
      <span className="grid grid-cols-[minmax(5.8rem,0.42fr)_minmax(0,1fr)] gap-[0.35rem]">
        <select
          className={fastControl}
          aria-label={copy.Controls.valueShapeAccessibleName(label)}
          value={draft.mode}
          onChange={(event) => onPatch({ mode: event.target.value })}
        >
          <option value="exact">{copy.Controls.exact}</option>
          <option value="range">{copy.Controls.range}</option>
          <option value="unknown">{copy.Controls.unknown}</option>
        </select>
        {draft.mode === "exact" && (
          <span className="relative flex min-w-0">
            <input
              type="number"
              className={fastControl}
              aria-label={label}
              value={draft.exact}
              step={0.01}
              min={0}
              onChange={(event) => onPatch({ exact: event.target.valueAsNumber || 0 })}
            />
            <span
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[0.55rem] text-muted"
              aria-hidden="true"
            >
              {suffix}
            </span>
          </span>
        )}
        {draft.mode === "range" && (
          <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
            <input
              type="number"
              className={cx(fastControl, "min-w-0")}
              aria-label={copy.Controls.minimumAccessibleName(label)}
              value={draft.min}
              step={0.01}
              min={0}
              onChange={(event) => onPatch({ min: event.target.valueAsNumber || 0 })}
            />
            <span aria-hidden="true">–</span>
            <input
              type="number"
              className={cx(fastControl, "min-w-0")}
              aria-label={copy.Controls.maximumAccessibleName(label)}
              value={draft.max}
              step={0.01}
              min={0}
              onChange={(event) => onPatch({ max: event.target.valueAsNumber || 0 })}
            />
          </span>
        )}
        {draft.mode === "unknown" && (
          <select
            className={fastControl}
            aria-label={copy.Controls.unknownReasonAccessibleName(label)}
            value={draft.unknownReason}
            onChange={(event) => onPatch({ unknownReason: event.target.value })}
          >
            <option value="not_provided">{copy.Controls.notProvided}</option>
            <option value="not_known">{copy.Controls.notKnown}</option>
            <option value="not_applicable">{copy.Controls.notApplicable}</option>
          </select>
        )}
      </span>
    </label>
  );
}

export function fastExactNumberPatch(rawValue: string): Readonly<Record<string, unknown>> {
  if (rawValue === "") return { mode: "unknown", unknownReason: "not_provided" };
  const exact = Number(rawValue);
  return Number.isFinite(exact)
    ? { mode: "exact", exact }
    : { mode: "unknown", unknownReason: "not_provided" };
}

export function FastExactNumberControl({
  label,
  placeholder,
  draft,
  onPatch,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly draft: NumberFactDraft;
  readonly onPatch: (patch: Readonly<Record<string, unknown>>) => void;
}) {
  return (
    <input
      className="min-w-0 text-detail"
      type="number"
      aria-label={label}
      title={label}
      placeholder={placeholder}
      value={draft.mode === "exact" ? draft.exact : ""}
      step={0.01}
      min={0}
      onChange={(event) => onPatch(fastExactNumberPatch(event.target.value))}
    />
  );
}
