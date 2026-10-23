import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CycleDetailDoc,
  CycleDetailItem,
  CycleReleaseTracking,
  ItemApplyStatus,
  ReleaseTrackingKey,
} from "../lib/cycleDetailTypes";
import {
  APPLY_STATUSES,
  RELEASE_STATUS_OPTIONS,
  RELEASE_TRACKING_ROWS,
  itemsSignature,
  newDetailItemId,
} from "../lib/cycleDetailTypes";
import type { SecurityCycle, SecurityIssue, SecurityRosterEntry } from "../lib/securityTypes";
import { seedDetailFromIssues } from "../lib/securityStore";
import type { Project } from "../lib/types";

type ProjectCol = {
  id: string;
  name: string;
  lenovo_name: string;
  blurb: string;
};

function nextApply(cur: ItemApplyStatus): ItemApplyStatus {
  const i = APPLY_STATUSES.indexOf(cur);
  return APPLY_STATUSES[(i + 1) % APPLY_STATUSES.length] ?? "";
}

function cloneItems(items: CycleDetailItem[]): CycleDetailItem[] {
  return items.map((it) => ({ ...it, applies: { ...it.applies } }));
}

function cloneRelease(release: CycleReleaseTracking): CycleReleaseTracking {
  return {
    by_project: Object.fromEntries(
      Object.entries(release.by_project).map(([pid, cell]) => [pid, { ...cell }]),
    ),
  };
}

/** Normalize stored date strings to YYYY-MM-DD for <input type="date">. */
function toDateInputValue(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const mm = slash[1].padStart(2, "0");
    const dd = slash[2].padStart(2, "0");
    return `${slash[3]}-${mm}-${dd}`;
  }
  return s;
}

export function CycleDetailPanel({
  cycle,
  roster,
  projects,
  issues,
  saved,
  busy,
  onBack,
  onEditCycle,
  onSaveItems,
  onAutoSaveRelease,
}: {
  cycle: SecurityCycle;
  roster: SecurityRosterEntry[];
  projects: Project[];
  issues: SecurityIssue[];
  /** Persisted doc (null → seed items from issues on first paint). */
  saved: CycleDetailDoc | null;
  busy: boolean;
  onBack: () => void;
  onEditCycle: () => void;
  /** Persist security-update items (Save All). Includes current release snapshot. */
  onSaveItems: (doc: CycleDetailDoc) => Promise<void>;
  /** Persist release tracking immediately on each cell change. */
  onAutoSaveRelease: (release: CycleReleaseTracking) => Promise<void>;
}) {
  const projectCols: ProjectCol[] = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const byName = new Map(projects.map((p) => [p.name, p]));
    const rows = roster
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.project_name.localeCompare(b.project_name));
    return rows.map((r) => {
      const linked = byId.get(r.project_id) ?? byName.get(r.project_name);
      const platform = [linked?.platform, linked?.bios_id].filter(Boolean).join(" / ");
      const waveBlurb = r.wave && r.wave !== "Not set" ? r.wave : "";
      return {
        id: r.project_id,
        name: r.project_name,
        lenovo_name: (linked?.lenovo_name ?? "").trim(),
        blurb: waveBlurb || platform || (linked?.description ?? "").trim().slice(0, 48),
      };
    });
  }, [roster, projects]);

  const projectIds = useMemo(() => projectCols.map((p) => p.id), [projectCols]);

  const initial = useMemo(() => {
    // Persist may have release-only rows (autosave) with empty items — still seed items locally.
    const items =
      saved && saved.items.length > 0
        ? cloneItems(saved.items)
        : cloneItems(seedDetailFromIssues(cycle.id, issues, projectIds).items);
    const release = saved
      ? cloneRelease(saved.release)
      : { by_project: {} as CycleReleaseTracking["by_project"] };
    return { items, release };
  }, [saved, cycle.id, issues, projectIds]);

  const [itemsBaseline, setItemsBaseline] = useState(() => itemsSignature(initial.items));
  const [items, setItems] = useState(() => cloneItems(initial.items));
  const [release, setRelease] = useState(() => cloneRelease(initial.release));
  const [releaseOpen, setReleaseOpen] = useState(true);
  const [error, setError] = useState("");
  const [releaseSaving, setReleaseSaving] = useState(false);
  const releaseSaveGen = useRef(0);

  // Reset items when cycle changes or persisted *items* change (Save All).
  // Release-only autosaves update `saved` but keep the same items signature — do not clobber draft.
  const savedItemsSig =
    saved && saved.items.length > 0 ? itemsSignature(saved.items) : `seed:${cycle.id}`;
  const cycleKey = cycle.id;
  const prevItemsSig = useRef(savedItemsSig);
  const prevCycle = useRef(cycleKey);
  useEffect(() => {
    const cycleChanged = prevCycle.current !== cycleKey;
    const itemsChanged = prevItemsSig.current !== savedItemsSig;
    prevCycle.current = cycleKey;
    prevItemsSig.current = savedItemsSig;
    if (!cycleChanged && !itemsChanged) {
      // Release autosave only — sync release from server, keep item draft.
      setRelease(cloneRelease(initial.release));
      return;
    }
    setItems(cloneItems(initial.items));
    setItemsBaseline(itemsSignature(initial.items));
    setRelease(cloneRelease(initial.release));
    setError("");
  }, [cycleKey, savedItemsSig, initial]);

  const itemsDirty = itemsSignature(items) !== itemsBaseline;

  const updateItem = useCallback((id: string, patch: Partial<CycleDetailItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const setApply = useCallback((itemId: string, projectId: string, status: ItemApplyStatus) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, applies: { ...it.applies, [projectId]: status } } : it,
      ),
    );
  }, []);

  const addItem = () => {
    setItems((prev) => {
      const applies: Record<string, ItemApplyStatus> = {};
      for (const pid of projectIds) applies[pid] = "";
      const item: CycleDetailItem = {
        id: newDetailItemId(),
        title: "New security item",
        detail: "",
        cycle_comment: "",
        applies,
        sort_order: prev.length,
      };
      return [...prev, item];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id).map((it, i) => ({ ...it, sort_order: i })));
  };

  const persistRelease = useCallback(
    async (next: CycleReleaseTracking) => {
      const gen = ++releaseSaveGen.current;
      setReleaseSaving(true);
      setError("");
      try {
        await onAutoSaveRelease(next);
      } catch (err) {
        if (gen === releaseSaveGen.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (gen === releaseSaveGen.current) setReleaseSaving(false);
      }
    },
    [onAutoSaveRelease],
  );

  const setReleaseCell = (projectId: string, key: ReleaseTrackingKey, value: string) => {
    setRelease((prev) => {
      const cell = { ...(prev.by_project[projectId] ?? {}), [key]: value };
      const next: CycleReleaseTracking = {
        by_project: { ...prev.by_project, [projectId]: cell },
      };
      void persistRelease(next);
      return next;
    });
  };

  const handleSaveItems = async () => {
    setError("");
    try {
      const doc: CycleDetailDoc = {
        cycle_id: cycle.id,
        items: cloneItems(items),
        release: cloneRelease(release),
        updated_at: new Date().toISOString(),
      };
      await onSaveItems(doc);
      setItemsBaseline(itemsSignature(items));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBack = () => {
    if (itemsDirty && !window.confirm("Discard unsaved security item changes?")) return;
    onBack();
  };

  const sortedItems = useMemo(
    () => items.slice().sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );

  const colCount = 2 + projectCols.length;

  return (
    <div className="sec-detail">
      <div className="sec-detail-toolbar">
        <div className="sec-detail-heading">
          <button type="button" className="sec-detail-back" onClick={handleBack}>
            ← Back
          </button>
          <div className="sec-detail-title-row">
            <h1 className="sec-detail-title">
              {cycle.name}
              {cycle.quarter ? ` · ${cycle.quarter}` : ""}
            </h1>
            <button
              type="button"
              className="sec-detail-gear"
              onClick={onEditCycle}
              aria-label="Edit cycle"
              title="Edit cycle"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
              </svg>
            </button>
          </div>
          <p className="sec-detail-sub">Security update review and project release tracking.</p>
        </div>
        <div className="sec-detail-actions">
          {itemsDirty && <span className="sec-detail-dirty">Unsaved items</span>}
          {releaseSaving && <span className="sec-detail-autosave">Saving release…</span>}
          <button
            type="button"
            className="sec-new-item"
            onClick={addItem}
            disabled={busy}
          >
            <span className="sec-new-item-plus" aria-hidden="true">
              +
            </span>
            <span>New item</span>
          </button>
          <button
            type="button"
            className="sec-btn-ghost sec-save-all"
            onClick={() => void handleSaveItems()}
            disabled={busy || !itemsDirty}
            title="Save security update items"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save All
          </button>
        </div>
      </div>

      {error && <p className="sec-error">{error}</p>}

      <div className="sec-detail-matrix-wrap">
        <table className="sec-detail-matrix sec-detail-unified">
          <colgroup>
            <col className="sec-col-item" />
            <col className="sec-col-comment" />
            {projectCols.map((p) => (
              <col key={p.id} className="sec-col-proj" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sec-detail-sticky-col sec-detail-sticky-1">Security Update Item</th>
              <th className="sec-detail-sticky-col sec-detail-sticky-2">Cycle Comment</th>
              {projectCols.map((p) => (
                <th key={p.id} className="sec-detail-proj-col">
                  <div className="sec-detail-proj-head">
                    <strong>{p.name}</strong>
                    {p.blurb ? <span className="sec-detail-proj-blurb">{p.blurb}</span> : null}
                    {p.lenovo_name ? (
                      <span className="sec-detail-proj-lenovo" title="Lenovo Project Name">
                        {p.lenovo_name}
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="sec-roster-empty">
                  No security items yet — click + New item
                </td>
              </tr>
            ) : (
              sortedItems.map((item, idx) => (
                <tr key={item.id}>
                  <td className="sec-detail-sticky-col sec-detail-sticky-1 sec-detail-item-cell">
                    <div className="sec-detail-item-card">
                      <div className="sec-detail-item-top">
                        <input
                          className="sec-detail-item-title"
                          value={item.title}
                          onChange={(e) => updateItem(item.id, { title: e.target.value })}
                          aria-label={`Item ${idx + 1} title`}
                        />
                        <button
                          type="button"
                          className="sec-detail-trash"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Delete ${item.title || "item"}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                      <input
                        className="sec-detail-item-detail"
                        value={item.detail}
                        onChange={(e) => updateItem(item.id, { detail: e.target.value })}
                        placeholder="Version / path / note"
                        aria-label={`Item ${idx + 1} detail`}
                      />
                      <span className="sec-detail-item-num">#{idx + 1}</span>
                    </div>
                  </td>
                  <td className="sec-detail-sticky-col sec-detail-sticky-2 sec-detail-comment-col">
                    <input
                      className="sec-detail-cell-input"
                      value={item.cycle_comment}
                      onChange={(e) => updateItem(item.id, { cycle_comment: e.target.value })}
                      placeholder="—"
                      aria-label={`Cycle comment for ${item.title || `item ${idx + 1}`}`}
                    />
                  </td>
                  {projectCols.map((p) => {
                    const status = item.applies[p.id] ?? "";
                    return (
                      <td key={p.id} className="sec-detail-proj-col">
                        <button
                          type="button"
                          className={`sec-apply-btn${status === "Applied" ? " is-applied" : ""}${
                            status === "Not Applied" ? " is-not-applied" : ""
                          }${!status ? " is-empty" : ""}`}
                          onClick={() => setApply(item.id, p.id, nextApply(status))}
                          aria-label={`${item.title || "Item"} · ${p.name}: ${status || "unset"}`}
                        >
                          {status || "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}

            <tr className="sec-release-section-row">
              <td colSpan={colCount} className="sec-release-section-cell">
                <button
                  type="button"
                  className="sec-release-toggle"
                  aria-expanded={releaseOpen}
                  onClick={() => setReleaseOpen((o) => !o)}
                >
                  <span aria-hidden="true">{releaseOpen ? "∨" : "›"}</span> Project Release Tracking
                  <span className="sec-release-hint">auto-saves</span>
                </button>
              </td>
            </tr>

            {releaseOpen &&
              RELEASE_TRACKING_ROWS.map((row) => (
                <tr
                  key={row.key}
                  className={row.kind === "status" ? "sec-release-status-row" : "sec-release-field-row"}
                >
                  <td
                    className="sec-detail-sticky-col sec-detail-sticky-1 sec-release-label"
                    colSpan={2}
                  >
                    {row.label}
                  </td>
                  {projectCols.map((p) => {
                    const value = release.by_project[p.id]?.[row.key] ?? "";
                    if (row.kind === "status") {
                      return (
                        <td key={p.id} className="sec-detail-proj-col">
                          <select
                            className={`sec-release-select${value === "Ongoing" ? " is-ongoing" : ""}${
                              value === "Done" ? " is-done" : ""
                            }`}
                            value={value}
                            onChange={(e) => setReleaseCell(p.id, row.key, e.target.value)}
                            aria-label={`${row.label} · ${p.name}`}
                          >
                            {RELEASE_STATUS_OPTIONS.map((opt) => (
                              <option key={opt || "empty"} value={opt}>
                                {opt || "—"}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }
                    if (row.kind === "date") {
                      return (
                        <td key={p.id} className="sec-detail-proj-col">
                          <input
                            type="date"
                            className="sec-detail-date-input"
                            value={toDateInputValue(value)}
                            onChange={(e) => setReleaseCell(p.id, row.key, e.target.value)}
                            aria-label={`${row.label} · ${p.name}`}
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={p.id} className="sec-detail-proj-col">
                        <input
                          className="sec-detail-cell-input"
                          value={value}
                          onChange={(e) => setReleaseCell(p.id, row.key, e.target.value)}
                          placeholder="—"
                          aria-label={`${row.label} · ${p.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
