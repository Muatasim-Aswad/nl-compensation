// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { Preferences } from "./Preferences.js";
import { HelpTip } from "../shared/HelpTip.js";

let root: Root;
let container: HTMLDivElement;
async function click(text: string, selector = "button") {
  const element = [...container.querySelectorAll<HTMLElement>(selector)].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!element) throw new Error(`Missing control: ${text}`);
  await act(async () => element.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () =>
    root.render(
      <Preferences draftKey="synthetic-draft">
        {(autosave) => (
          <>
            <span data-autosave>{String(autosave)}</span>
            <HelpTip label="First help">First explanation</HelpTip>
            <HelpTip label="Second help">Second explanation</HelpTip>
          </>
        )}
      </Preferences>,
    ),
  );
}

test("removing the browser draft disables retention while keeping this tab active", async () => {
  window.localStorage.setItem("synthetic-draft", "synthetic-private-value");
  await render();
  await click("Settings");
  await click("Remove browser draft");
  expect(window.localStorage.getItem("synthetic-draft")).toBeNull();
  expect(container.querySelector("[data-autosave]")?.textContent).toBe("false");
  expect(container.textContent).toContain("Current form values remain in this tab");
});

test("tips show one at a time, retain dismissal, and respect the Settings switch", async () => {
  await render();
  const summary = (label: string) =>
    container.querySelector<HTMLElement>(`summary[aria-label="${label}"]`)!;
  await act(async () => summary("First help").click());
  expect(container.querySelectorAll("details[open]")).toHaveLength(1);
  await act(async () => summary("Second help").click());
  expect(summary("First help").closest("details")?.open).toBe(false);
  expect(summary("Second help").closest("details")?.open).toBe(true);
  const dismiss = summary("Second help")
    .closest("details")!
    .querySelector<HTMLButtonElement>("button")!;
  await act(async () => dismiss.click());
  expect(window.localStorage.getItem("nl-compensation:help:v1")).toContain("Second help");
  await click("Settings");
  const checkbox = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')][0];
  await act(async () => checkbox.click());
  await act(async () => summary("First help").click());
  expect(container.querySelectorAll("details[open]")).toHaveLength(0);
});
