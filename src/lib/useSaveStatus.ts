import { useEffect, useRef, useState } from "react";

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; seconds: number };

function formatSaveSeconds(ms: number): number {
  return Math.max(0, Math.round(ms / 10) / 100);
}

/**
 * Same Saving / Saved Xs pattern as Personnel.
 * Wrap any shared/cloud/org-store mutation with `runSave`.
 */
export function useSaveStatus(hideAfterMs = 1000) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const runSave = async <T,>(work: () => Promise<T>): Promise<T> => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setSaveStatus({ kind: "saving" });
    const started = performance.now();
    try {
      const slow = Number(localStorage.getItem("AWB_SLOW_SAVE") || "0");
      if (slow > 0) await new Promise((r) => setTimeout(r, slow));
      const result = await work();
      const seconds = formatSaveSeconds(performance.now() - started);
      setSaveStatus({ kind: "saved", seconds });
      hideTimer.current = setTimeout(() => {
        setSaveStatus({ kind: "idle" });
        hideTimer.current = null;
      }, hideAfterMs);
      return result;
    } catch (err) {
      setSaveStatus({ kind: "idle" });
      throw err;
    }
  };

  return { saveStatus, runSave };
}
