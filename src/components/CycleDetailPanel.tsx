import { useCallback, useEffect, useMemo, useState } from "react";
import type { CycleDetailDoc, CycleDetailItem, ItemApplyStatus } from "../lib/cycleDetailTypes";
import {
  APPLY_STATUSES,
  RELEASE_STATUS_OPTIONS,
  RELEASE_TRACKING_ROWS,
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

function cloneDoc(doc: CycleDetailDoc): CycleDetailDoc {
  return {
    cycle_id: doc.cycle_id,
    items: doc.items.map((it) => ({
      ...it,
      applies: { ...it.applies },
    })),
    release: {
      by_project: Object.fromEntries(
        Object.entries(doc.release.by_project).map(([pid, cell]) => [pid, { ...cell }]),
      ),
    },
    updated_at: doc.updated_at,
  };
}

function docSignature(doc: CycleDetailDoc): string {
  return JSON.stringify({
    items: doc.items,
    release: doc.release,
  });
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
  onSave,
}: {
  cycle: SecurityCycle;
  roster: SecurityRosterEntry[];
  projects: Project[];
  issues: SecurityIssue[];
  /** Persisted doc (null → seed from issues on first paint). */
  saved: CycleDetailDoc | null;
  busy: boolean;
  onBack: () => void;
  onEditCycle: () => void;
  onSave: (doc: CycleDetailDoc) => Promise<void>;
}) {
  const projectCols: ProjectCol[] = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const byName = new Map(projects.map((p) => [p.name, p]));
    const rows = roster
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.project_name.localeCompare(b.project_name));
    return rows.map((r) => {
      const linked = byId.get(r.project_id) ?? byName.get(r.project_name);
      const blurb = [linked?.platform, linked?.bios_id].filter(Boolean).join(" / ");
      return {
        id: r.project_id,
        name: r.project_name,
        lenovo_name: (linked?.lenovo_name ?? "").trim(),
        blurb: blurb || (linked?.description ?? "").trim().slice(0, 48),
      };
    });
  }, [roster, projects]);

  const projectIds = useMemo(() => projectCols.map((p) => p.id), [projectCols]);

  const initialDoc = useMemo(() => {
    if (saved) return cloneDoc(saved);
    return seedDetailFromIssues(cycle.id, issues, projectIds);
  }, [saved, cycle.id, issues, projectIds]);

  const [baseline, setBaseline] = useState(() => docSignature(initialDoc));
  const [draft, setDraft] = useState(() => cloneDoc(initialDoc));
  const [releaseOpen, setReleaseOpen] = useState(true);
  const [error, setError] = useState("");

  // Reset draft when switching cycles or when saved reloads after Save All.
  useEffect(() => {
    const next = initialDoc;
    setDraft(cloneDoc(next));
    setBaseline(docSignature(next));
    setError("");
  }, [initialDoc]);

  const dirty = docSignature(draft) !== baseline;

  const updateItem = useCallback((id: string, patch: Partial<CycleDetailItem>) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }, []);

  const setApply = useCallback((itemId: string, projectId: string, status: ItemApplyStatus) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.id === itemId
          ? { ...it, applies: { ...it.applies, [projectId]: status } }
          : it,
      ),
    }));
  }, []);

  const addItem = () => {
    setDraft((prev) => {
      const applies: Record<string, ItemApplyStatus> = {};
      for (const pid of projectIds) applies[pid] = "";
      const item: CycleDetailItem = {
        id: newDetailItemId(),
        title: "New security item",
        detail: "",
        cycle_comment: "",
        applies,
        sort_order: prev.items.length,
      };
      return { ...prev, items: [...prev.items, item] };
    });
  };

  const removeItem = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== id).map((it, i) => ({ ...it, sort_order: i })),
    }));
  };

  const setReleaseCell = (projectId: string, key: string, value: string) => {
    setDraft((prev) => {
      const cell = { ...(prev.release.by_project[projectId] ?? {}), [key]: value };
      return {
        ...prev,
        release: {
          by_project: { ...prev.release.by_project, [projectId]: cell },
        },
      };
    });
  };

  const handleSave = async () => {
    setError("");
    try {
      await onSave(draft);
      setBaseline(docSignature(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBack = () => {
    if (dirty && !window.confirm("Discard unsaved cycle detail changes?")) return;
    onBack();
  };

  const sortedItems = useMemo(
    () => draft.items.slice().sort((a, b) => a.sort_order - b.sort_order),
    [draft.items],
  );

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
          {dirty && <span className="sec-detail-dirty">Unsaved draft</span>}
          <button type="button" className="sec-add-issue" onClick={addItem} disabled={busy}>
            <span aria-hidden="true">+</span> New item
          </button>
          <button
            type="button"
            className="sec-btn-ghost sec-save-all"
            onClick={() => void handleSave()}
            disabled={busy || !dirty}
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
        <table className="sec-detail-matrix">
          <thead>
            <tr>
              <th className="sec-detail-sticky-col">Security Update Item</th>
              <th className="sec-detail-comment-col">Cycle Comment</th>
              {projectCols.map((p) => (
                <th key={p.id} className="sec-detail-proj-col">
                  <div className="sec-detail-proj-head">
                    <strong>{p.name}</strong>
                    {p.blurb ? <span className="sec-detail-proj-blurb">{p.blurb}</span> : null}
                    {p.lenovo_name ? (
                      <span className="sec-detail-proj-lenovo" title="Lenovo project name">
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
                <td colSpan={2 + projectCols.length} className="sec-roster-empty">
                  No security items yet — click + New item
                </td>
              </tr>
            ) : (
              sortedItems.map((item, idx) => (
                <tr key={item.id}>
                  <td className="sec-detail-sticky-col sec-detail-item-cell">
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
                  <td className="sec-detail-comment-col">
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
          </tbody>
        </table>
      </div>

      <section className="sec-release" aria-label="Project Release Tracking">
        <button
          type="button"
          className="sec-release-toggle"
          aria-expanded={releaseOpen}
          onClick={() => setReleaseOpen((o) => !o)}
        >
          <span aria-hidden="true">{releaseOpen ? "∨" : "›"}</span> Project Release Tracking
        </button>
        {releaseOpen && (
          <div className="sec-detail-matrix-wrap">
            <table className="sec-detail-matrix sec-release-matrix">
              <thead>
                <tr>
                  <th className="sec-detail-sticky-col">Field</th>
                  {projectCols.map((p) => (
                    <th key={p.id} className="sec-detail-proj-col">
                      <strong>{p.name}</strong>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RELEASE_TRACKING_ROWS.map((row) => (
                  <tr
                    key={row.key}
                    className={row.kind === "status" ? "sec-release-status-row" : undefined}
                  >
                    <td className="sec-detail-sticky-col sec-release-label">{row.label}</td>
                    {projectCols.map((p) => {
                      const value = draft.release.by_project[p.id]?.[row.key] ?? "";
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
        )}
      </section>
    </div>
  );
}
