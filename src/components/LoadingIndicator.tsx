/** Spinner + label — same compact pill look as SavingIndicator. */
export function LoadingIndicator({ label = "載入中…" }: { label?: string }) {
  return (
    <div className="save-status is-saving" role="status" aria-live="polite">
      <span className="save-status-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
