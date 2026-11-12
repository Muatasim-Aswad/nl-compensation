import { useState } from "react";
import { Compensation } from "../features/compensation/Compensation.js";
import { SCENARIO_DRAFT_STORAGE_KEY } from "../features/compensation/draft.js";
import { readPreference, writePreference } from "../infra/browser-storage.js";
import { cx, disclosureParagraph, disclosureSummary, eyebrow, textButton } from "../shared/ui.js";
import { copy } from "./copy.js";
import { Preferences } from "./Preferences.js";

function Shell({ autosave }: { readonly autosave: boolean }) {
  const [introVisible, setIntroVisible] = useState(
    () => readPreference("nl-compensation:intro-visible") !== "false",
  );
  function toggleIntro() {
    const next = !introVisible;
    setIntroVisible(next);
    writePreference("nl-compensation:intro-visible", String(next));
  }
  return (
    <>
      <a
        className="fixed top-4 left-4 z-20 -translate-y-[180%] bg-ink px-4 py-3 text-white underline focus:translate-y-0"
        href="#scenario-form"
      >
        {copy.App.skipToCompensationFacts}
      </a>
      <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-line bg-canvas/94 px-gutter">
        <a
          className="inline-flex items-center gap-[0.65rem] text-ink no-underline"
          href="#top"
          aria-label={copy.App.homeAccessibleName}
        >
          <span
            className="grid size-8 place-items-center rounded-full bg-pine font-mono text-subhead font-medium text-white"
            aria-hidden="true"
          >
            {copy.App.brandMark}
          </span>
          <strong className="tracking-[-0.035em]">{copy.App.compensation}</strong>
        </a>
        <div className="flex items-center gap-4">
          <p className="text-item text-muted max-sm:hidden">
            {autosave
              ? copy.App.localFirstScenarioSavesInThisBrowser
              : copy.App.browserDraftSavingIsOff}
          </p>
          <button
            type="button"
            className={cx(textButton(), "whitespace-nowrap")}
            aria-expanded={introVisible}
            onClick={toggleIntro}
          >
            {introVisible ? copy.App.hideIntro : copy.App.showIntro}
          </button>
        </div>
      </header>

      <main id="top">
        {introVisible && (
          <section className="grid grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)] items-end gap-[clamp(2rem,7vw,8rem)] border-b border-line px-gutter pt-[clamp(3.5rem,8vw,7.5rem)] pb-[clamp(3rem,6vw,5.5rem)] max-lg:grid-cols-1 max-lg:gap-8 max-sm:px-4">
            <div>
              <p className={eyebrow}>{copy.App.openFormOfferComparison}</p>
              <h1 className="max-w-[900px] text-[clamp(2.9rem,6.2vw,6.7rem)] leading-[0.93] font-semibold tracking-[-0.067em] max-sm:text-[clamp(2.65rem,13vw,4rem)]">
                {copy.App.heroLead}
                <br />
                <em className="font-serif font-medium text-pine">{copy.App.heroEmphasis}</em>
              </h1>
            </div>
            <div className="max-w-[33rem]">
              <p className="mb-6 text-[clamp(1rem,1.35vw,1.2rem)] leading-[1.7] text-copy">
                {copy.App.introBody}
              </p>
              <details className="mt-[1.1rem] border-t border-line pt-[0.9rem]">
                <summary className={disclosureSummary}>
                  {copy.App.currencyAndValueConventions}
                </summary>
                <p className={disclosureParagraph}>{copy.App.valueConventions}</p>
              </details>
            </div>
          </section>
        )}

        <Compensation autosave={autosave} />
      </main>
      <footer className="flex justify-between gap-4 px-gutter py-10 text-small text-muted max-sm:flex-col">
        <span className="font-bold text-ink">{copy.App.productName}</span>
        <p>{copy.App.estimatesAreLabelledUnsupportedCasesStayUnsupported}</p>
      </footer>
    </>
  );
}

export function App() {
  return (
    <Preferences draftKey={SCENARIO_DRAFT_STORAGE_KEY}>
      {(autosave) => <Shell autosave={autosave} />}
    </Preferences>
  );
}
