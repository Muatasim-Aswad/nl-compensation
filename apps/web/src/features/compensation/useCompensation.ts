import {
  normalizeEmployerPackage,
  type CompensationCaseInput,
  type CompensationReport,
} from "@nl-compensation/core";
import { useEffect, useMemo, useReducer, useState } from "react";
import { calculateCase } from "./api.js";
import { copy } from "./copy.js";
import { loadScenarioDraft, persistScenarioDraft } from "./draft.js";
import type { RangeDisplayMode } from "./format.js";
import {
  initialScenario,
  scenarioAtRangeSelection,
  scenarioReducer,
  toCompensationCase,
} from "./scenario.js";

interface CalculationState {
  readonly input?: CompensationCaseInput;
  readonly report?: CompensationReport;
  readonly error?: string;
}

export function useCompensation(autosave: boolean) {
  const [scenario, dispatch] = useReducer(scenarioReducer, initialScenario, () =>
    loadScenarioDraft(),
  );
  const [rangeDisplayMode, setRangeDisplayMode] = useState<RangeDisplayMode>("both");
  const [result, setResult] = useState<CalculationState>({});
  const calculationScenario = useMemo(
    () =>
      rangeDisplayMode === "both" ? scenario : scenarioAtRangeSelection(scenario, rangeDisplayMode),
    [scenario, rangeDisplayMode],
  );
  const local = useMemo(() => {
    try {
      toCompensationCase(scenario);
      const calculationInput = toCompensationCase(calculationScenario);
      return {
        calculationInput,
        normalization: normalizeEmployerPackage(calculationInput.employerPackage),
        error: "",
      };
    } catch {
      return {
        calculationInput: undefined,
        normalization: undefined,
        error: copy.useCompensation.invalidScenario,
      };
    }
  }, [scenario, calculationScenario]);

  useEffect(() => {
    if (autosave) persistScenarioDraft(scenario);
  }, [scenario, autosave]);

  useEffect(() => {
    const input = local.calculationInput;
    if (!input) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void calculateCase(input, fetch, controller.signal)
        .then((report) => {
          if (!controller.signal.aborted) setResult({ input, report });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResult({ input, error: copy.useCompensation.calculationUnavailable });
        });
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [local.calculationInput]);

  const current = result.input === local.calculationInput;
  return {
    scenario,
    dispatch,
    calculationScenario,
    local,
    rangeDisplayMode,
    setRangeDisplayMode,
    report: current ? result.report : undefined,
    calculationError: current ? result.error : undefined,
    loading: !!local.calculationInput && !current,
  };
}
