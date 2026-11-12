import { useRef } from "react";
import { useEffect, useState } from "react";
import { ApiError } from "../../../infra/http.js";
import { readRevision, saveCase, saveDefault } from "../api.js";
import { copy } from "../copy.js";
import { toCompensationCase } from "../scenario.js";
import type { FormProps } from "./form.js";

export function SaveControls({ scenario, dispatch }: FormProps) {
  const [revision, setRevision] = useState<{
    caseId: string;
    profile: string | null;
    case: string | null;
  }>();
  const [status, setStatus] = useState("");
  const pending = useRef<Partial<Record<"profile" | "case", { input: string; id: string }>>>({});
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readRevision("/api/v1/profile", fetch, controller.signal),
      scenario.caseId
        ? readRevision(
            `/api/v1/cases/${encodeURIComponent(scenario.caseId)}`,
            fetch,
            controller.signal,
          )
        : Promise.resolve(null),
    ])
      .then(([profile, savedCase]) => {
        if (!controller.signal.aborted)
          setRevision({ caseId: scenario.caseId, profile, case: savedCase });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus(copy.SaveControls.revisionUnavailable);
      });
    return () => controller.abort();
  }, [scenario.caseId, refresh]);

  async function save(kind: "profile" | "case") {
    if (!revision || revision.caseId !== scenario.caseId) return;
    setBusy(true);
    try {
      const input = toCompensationCase(scenario);
      const serialized = JSON.stringify(input);
      const mutation =
        pending.current[kind]?.input === serialized
          ? pending.current[kind]!
          : { input: serialized, id: crypto.randomUUID() };
      pending.current[kind] = mutation;
      const next = await (kind === "profile" ? saveDefault : saveCase)(
        input,
        revision[kind],
        fetch,
        mutation.id,
      );
      delete pending.current[kind];
      setRevision({ ...revision, [kind]: next });
      setStatus(kind === "profile" ? copy.SaveControls.profileSaved : copy.SaveControls.caseSaved);
    } catch (error) {
      setStatus(
        error instanceof ApiError && error.code === "conflict"
          ? copy.SaveControls.conflict
          : copy.SaveControls.saveFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mb-6 border border-line p-4">
      <summary className="cursor-pointer font-bold">{copy.SaveControls.saveToThisComputer}</summary>
      <p className="my-3 text-small text-muted">{copy.SaveControls.persistenceHelp}</p>
      <label className="block text-small">
        {copy.SaveControls.caseIdLabel}
        <input
          disabled={busy}
          value={scenario.caseId}
          onChange={(event) =>
            dispatch({ type: "patch", path: [], patch: { caseId: event.target.value } })
          }
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !revision || revision.caseId !== scenario.caseId}
          onClick={() => void save("profile")}
        >
          {copy.SaveControls.saveAsDefault}
        </button>
        <button
          type="button"
          disabled={busy || !revision || revision.caseId !== scenario.caseId || !scenario.caseId}
          onClick={() => void save("case")}
        >
          {copy.SaveControls.saveCase}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            pending.current = {};
            setRevision(undefined);
            setStatus("");
            setRefresh((value) => value + 1);
          }}
        >
          {copy.SaveControls.recheckSavedRevisions}
        </button>
      </div>
      <p role="status" className="mt-3 text-small">
        {status}
      </p>
    </details>
  );
}
