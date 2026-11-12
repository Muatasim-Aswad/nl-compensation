import { useState, type ReactNode } from "react";
import { readPreference, removeBrowserValue, writePreference } from "../infra/browser-storage.js";
import { HelpContext } from "../shared/help.js";
import { copy } from "./copy.js";

const HELP_KEY = "nl-compensation:help:v1";
const AUTOSAVE_KEY = "nl-compensation:autosave";

function learnedTips(): readonly string[] {
  try {
    const value: unknown = JSON.parse(readPreference(HELP_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function Preferences({
  children,
  draftKey,
}: {
  readonly children: (autosave: boolean) => ReactNode;
  readonly draftKey: string;
}) {
  const [enabled, setEnabled] = useState(() => readPreference("nl-compensation:tips") !== "false");
  const [autosave, setAutosave] = useState(() => readPreference(AUTOSAVE_KEY) !== "false");
  const [learned, setLearned] = useState(learnedTips);
  const [active, setActive] = useState<string>();
  const [settings, setSettings] = useState(false);
  const [tour, setTour] = useState<number>();
  const [storageMessage, setStorageMessage] = useState("");
  function dismiss(label: string) {
    const next = [...new Set([...learned, label])];
    setLearned(next);
    writePreference(HELP_KEY, JSON.stringify(next));
    setActive(undefined);
  }
  const steps = copy.Preferences.tourSteps;
  return (
    <HelpContext.Provider
      value={{
        enabled,
        active,
        show: (label, automatic = false) => {
          if (enabled && (!automatic || (!learned.includes(label) && !active))) setActive(label);
        },
        dismiss,
      }}
    >
      <div className="border-b border-line px-gutter py-2 text-right">
        <button type="button" aria-expanded={settings} onClick={() => setSettings(!settings)}>
          {copy.Preferences.settings}
        </button>
        {settings && (
          <section
            aria-label={copy.Preferences.settingsAccessibleName}
            className="my-3 grid gap-3 text-start text-small"
          >
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  setEnabled(event.target.checked);
                  writePreference("nl-compensation:tips", String(event.target.checked));
                  setActive(undefined);
                }}
              />{" "}
              {copy.Preferences.showContextualTips}
            </label>
            <label>
              <input
                type="checkbox"
                checked={autosave}
                onChange={(event) => {
                  setAutosave(event.target.checked);
                  writePreference(AUTOSAVE_KEY, String(event.target.checked));
                  if (!event.target.checked && !removeBrowserValue(draftKey))
                    setStorageMessage(copy.Preferences.draftRemovalFailed);
                }}
              />{" "}
              {copy.Preferences.keepADraftInThisBrowser}
            </label>
            <p>{copy.Preferences.draftPrivacyHelp}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  const removed = removeBrowserValue(draftKey);
                  setAutosave(false);
                  writePreference(AUTOSAVE_KEY, "false");
                  setStorageMessage(
                    removed ? copy.Preferences.draftRemoved : copy.Preferences.clearSiteData,
                  );
                }}
              >
                {copy.Preferences.removeBrowserDraft}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLearned([]);
                  writePreference(HELP_KEY, "[]");
                }}
              >
                {copy.Preferences.resetLearnedTips}
              </button>
              <button type="button" onClick={() => setTour(0)}>
                {copy.Preferences.startTour}
              </button>
            </div>
            <p role="status">{storageMessage}</p>
          </section>
        )}
      </div>
      {tour !== undefined && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={copy.Preferences.compensationTour}
          className="border-b border-line bg-pine-light p-5"
        >
          <p>{steps[tour]}</p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setTour(tour < steps.length - 1 ? tour + 1 : undefined)}
            >
              {tour < steps.length - 1 ? copy.Preferences.next : copy.Preferences.done}
            </button>
            <button type="button" onClick={() => setTour(undefined)}>
              {copy.Preferences.closeTour}
            </button>
          </div>
        </section>
      )}
      {children(autosave)}
    </HelpContext.Provider>
  );
}
