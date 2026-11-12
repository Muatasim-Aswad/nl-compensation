type ClassValue = string | false | null | undefined;

export function cx(...classes: readonly ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

export const eyebrow =
  "mb-[0.8rem] font-mono text-caption leading-[1.3] font-medium tracking-[0.14em] text-pine uppercase";

export const subheading = "mt-8 mb-4 font-mono text-subhead font-bold tracking-[0.1em] uppercase";

export const sectionTitle = "text-[clamp(1.25rem,2vw,1.7rem)] font-bold tracking-[-0.04em]";

export function panel(tone: "default" | "attention" = "default"): string {
  return cx(
    "border p-7 max-sm:p-5",
    tone === "attention" ? "border-attention-border bg-attention-bg" : "border-line bg-paper",
  );
}

export const panelTitle = "text-[1.2rem] font-bold";

export const fieldFrame = "block min-w-0";

const labelText = "text-prompt font-bold text-label";

export const fieldLabel = `block ${labelText}`;

export const standaloneFieldLabel = `mb-[0.38rem] flex min-h-[1.35rem] items-center ${labelText}`;

export const fieldGrid = "grid grid-cols-2 gap-x-5 gap-y-[1.1rem] max-sm:grid-cols-1";

export const valueShapeRow =
  "grid grid-cols-[minmax(7rem,0.62fr)_minmax(8rem,1fr)] gap-[0.45rem] max-sm:grid-cols-1";

export const checkbox = "m-[3px_3px_3px_4px] size-4 accent-pine";

export const disclosureSummary = "cursor-pointer text-small font-bold text-pine";

export const disclosureText = "text-small leading-prose text-muted";

export const disclosureParagraph = `my-[1em] ${disclosureText}`;

export function textButton({
  tone = "default",
  flush = false,
}: { readonly tone?: "default" | "danger"; readonly flush?: boolean } = {}): string {
  return cx(
    "border-0 bg-transparent text-small underline underline-offset-3",
    flush ? "p-0" : "p-1",
    tone === "danger" ? "text-red" : "text-pine",
  );
}
