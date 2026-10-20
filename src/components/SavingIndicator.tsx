import type { SaveStatus } from "../lib/useSaveStatus";

/** Spinner + “Saving” / “Saved 0.12s” — same look as Personnel. */
export function SavingIndicator({ status }: { status: SaveStatus }) {
  if (status.kind === "idle") return null;
  return (
    <div
      className={`save-status${status.kind === "saving" ? " is-saving" : " is-saved"}`}
      role="status"
      aria-live="polite"
    >
      {status.kind === "saving" ? (
        <>
          <span className="save-status-spinner" aria-hidden="true" />
          <span>Saving</span>
        </>
      ) : (
        <span>Saved {status.seconds.toFixed(2)}s</span>
      )}
    </div>
  );
}
