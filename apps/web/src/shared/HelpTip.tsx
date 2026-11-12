import type { ReactNode } from "react";
import { copy } from "./copy.js";
import { useHelp } from "./help.js";
import { cx } from "./ui.js";

type Placement = "trailing" | "inline" | "section";

export function HelpTip({
  label,
  children,
  tone = "info",
  placement = "trailing",
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly tone?: "info" | "warning";
  readonly placement?: Placement;
}) {
  const help = useHelp();
  const open = help.enabled && help.active === label;
  return (
    <details
      open={open}
      className={cx("relative flex-none", placement === "trailing" && "ml-auto")}
    >
      <summary
        className={cx(
          "grid size-[1.05rem] cursor-pointer list-none place-items-center rounded-full border border-tip-border bg-field font-serif text-fine leading-none font-bold hover:border-pine hover:bg-pine-light [&::-webkit-details-marker]:hidden",
          tone === "warning" ? "text-red" : "text-pine",
        )}
        onClick={(event) => {
          event.preventDefault();
          if (open) help.dismiss(label);
          else help.show(label);
        }}
        aria-expanded={open}
        aria-label={label}
      >
        {tone === "warning" ? "!" : copy.HelpTip.i}
      </summary>
      <p
        className={cx(
          "absolute top-[calc(100%+0.45rem)] z-12 w-[min(18rem,calc(100vw-3rem))] rounded-control border border-line bg-field px-[0.8rem] py-[0.7rem] text-small leading-normal font-normal text-tip shadow-popover",
          placement === "section" ? "-left-8" : "right-0",
        )}
      >
        {children}
        <button type="button" className="mt-2 block underline" onClick={() => help.dismiss(label)}>
          {copy.HelpTip.dismissTip}
        </button>
      </p>
    </details>
  );
}
