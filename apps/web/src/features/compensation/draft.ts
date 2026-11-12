import {
  browserLocalStorage,
  type StorageReader,
  type StorageWriter,
} from "../../infra/browser-storage.js";
import { initialScenario, toCompensationCase, type ScenarioDraft } from "./scenario.js";
export const SCENARIO_DRAFT_STORAGE_KEY = "nl-compensation:scenario-draft:v1";
const SCENARIO_DRAFT_STORAGE_VERSION = 1;

export function loadScenarioDraft(
  storage: StorageReader | undefined = browserLocalStorage(),
): ScenarioDraft {
  if (!storage) return initialScenario;
  try {
    const raw = storage.getItem(SCENARIO_DRAFT_STORAGE_KEY);
    if (!raw) return initialScenario;
    const stored = JSON.parse(raw) as unknown;
    if (
      typeof stored !== "object" ||
      stored === null ||
      !("version" in stored) ||
      stored.version !== SCENARIO_DRAFT_STORAGE_VERSION ||
      !("scenario" in stored)
    ) {
      return initialScenario;
    }
    const scenario = stored.scenario as ScenarioDraft;
    toCompensationCase(scenario);
    return scenario;
  } catch {
    return initialScenario;
  }
}

export function persistScenarioDraft(
  scenario: ScenarioDraft,
  storage: StorageWriter | undefined = browserLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      SCENARIO_DRAFT_STORAGE_KEY,
      JSON.stringify({ version: SCENARIO_DRAFT_STORAGE_VERSION, scenario }),
    );
  } catch {
    // Browser-local persistence is best effort when storage is unavailable.
  }
}
