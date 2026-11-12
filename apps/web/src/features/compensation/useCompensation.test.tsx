// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { useCompensation } from "./useCompensation.js";
import { calculateCase } from "./api.js";
import { SCENARIO_DRAFT_STORAGE_KEY } from "./draft.js";
import type { CompensationReport } from "@nl-compensation/core";

vi.mock("./api.js", () => ({ calculateCase: vi.fn() }));
const calculate = vi.mocked(calculateCase);
let latest: ReturnType<typeof useCompensation>;
let root: Root;
let container: HTMLDivElement;
function Harness({ autosave }: { readonly autosave: boolean }) {
  latest = useCompensation(autosave);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("an older request cannot replace the current input's estimate", async () => {
  let first!: (report: CompensationReport) => void;
  let second!: (report: CompensationReport) => void;
  calculate
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          second = resolve;
        }),
    );
  await act(async () => root.render(<Harness autosave={false} />));
  await act(async () => vi.advanceTimersByTimeAsync(400));
  await act(async () =>
    latest.dispatch({
      type: "patch",
      path: ["educationBudget"],
      patch: { mode: "exact", exact: 2500 },
    }),
  );
  expect(latest.report).toBeUndefined();
  await act(async () => vi.advanceTimersByTimeAsync(400));
  const newer = { caseId: "newer" } as CompensationReport;
  await act(async () => second(newer));
  expect(latest.report).toBe(newer);
  await act(async () => first({ caseId: "stale" } as CompensationReport));
  expect(latest.report).toBe(newer);
  expect(calculate.mock.calls[0][2]?.aborted).toBe(true);
});

test("disabling autosave prevents later edits from recreating a removed draft", async () => {
  await act(async () => root.render(<Harness autosave={true} />));
  expect(window.localStorage.getItem(SCENARIO_DRAFT_STORAGE_KEY)).not.toBeNull();
  window.localStorage.removeItem(SCENARIO_DRAFT_STORAGE_KEY);
  await act(async () => root.render(<Harness autosave={false} />));
  await act(async () =>
    latest.dispatch({
      type: "patch",
      path: ["educationBudget"],
      patch: { mode: "exact", exact: 1000 },
    }),
  );
  expect(window.localStorage.getItem(SCENARIO_DRAFT_STORAGE_KEY)).toBeNull();
});
