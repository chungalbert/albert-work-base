import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type IssueColKey = "no" | "state" | "name" | "owner" | "start" | "deadline" | "analysis";

export type IssueColumnFilters = {
  no: string;
  state: string;
  name: string;
  owner: string;
  start: string;
  deadline: string;
  analysis: string;
};

export const EMPTY_ISSUE_COLUMN_FILTERS: IssueColumnFilters = {
  no: "",
  state: "",
  name: "",
  owner: "",
  start: "",
  deadline: "",
  analysis: "",
};

function SlidersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  label: string;
  colKey: IssueColKey;
  value: string;
  onChange: (next: string) => void;
  options?: { value: string; label: string }[];
  inputType?: "text" | "date" | "select";
  placeholder?: string;
};

export function IssueColumnFilter({
  label,
  colKey,
  value,
  onChange,
  options,
  inputType = "text",
  placeholder = "Filter…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const active = Boolean(value.trim());

  const placePanel = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const panelW = panelRef.current?.offsetWidth ?? 220;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - panelW - 8);
    setCoords({ top: rect.bottom + 6, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    placePanel();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => placePanel();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  let control: ReactNode;
  if (inputType === "select" && options) {
    control = (
      <select
        aria-label={`Filter ${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        type={inputType === "date" ? "date" : "text"}
        aria-label={`Filter ${label}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
    );
  }

  return (
    <div className="pi-col-filter" ref={rootRef} data-col={colKey}>
      <span className="pi-col-filter-label">{label}</span>
      <button
        ref={btnRef}
        type="button"
        className={`pi-col-filter-btn${active ? " on" : ""}${open ? " open" : ""}`}
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="pi-col-filter-panel"
            id={panelId}
            role="dialog"
            aria-label={`Filter ${label}`}
            style={{ top: coords.top, left: coords.left }}
          >
            <label className="pi-col-filter-field">
              <span>{label}</span>
              {control}
            </label>
            <div className="pi-col-filter-actions">
              <button
                type="button"
                className="pi-btn-ghost"
                disabled={!active}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
              <button type="button" className="pi-btn-primary" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
