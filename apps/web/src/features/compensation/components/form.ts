import type { Dispatch } from "react";
import type { DraftPath, ScenarioAction, ScenarioDraft } from "../scenario.js";
export interface FormProps {
  readonly scenario: ScenarioDraft;
  readonly dispatch: Dispatch<ScenarioAction>;
}
export function patchScenario(dispatch: Dispatch<ScenarioAction>) {
  return (path: DraftPath, value: Readonly<Record<string, unknown>>) =>
    dispatch({ type: "patch", path, patch: value });
}
