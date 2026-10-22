import { FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { SavingIndicator } from "../components/SavingIndicator";
import { useStore } from "../context/StoreContext";
import {
  cycleMetrics,
  securityDisplayDate,
  securityStore,
} from "../lib/securityStore";
import type {
  SecurityCycle,
  SecurityIssue,
  SecurityRosterEntry,
  SecurityRosterStatus,
  SecuritySnapshot,
  SecurityWave,
} from "../lib/securityTypes";
import {
  SECURITY_STATUSES,
  newWaveId,
  normalizeCycleWaves,
  rosterWaveOptions,
} from "../lib/securityTypes";
import { useSaveStatus } from "../lib/useSaveStatus";
import { PROJECT_COLUMNS_META_NAME } from "../lib/cloudApi";
import type { Profile } from "../lib/types";

type Tab = "overview" | "issues";

const CYCLE_PILL_TONES = ["tone-teal", "tone-rose", "tone-violet", "tone-amber", "tone-sky"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function cycleTone(index: number): string {
  return CYCLE_PILL_TONES[index % CYCLE_PILL_TONES.length];
}

function defaultQuarterLabel(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()} Q${q}`;
}

export function SecurityPage({ onGoDashboard }: { onGoDashboard?: () => void }) {
  const { projects, profiles, initialLoading } = useStore();
  const { saveStatus, runSave } = useSaveStatus();

  /** All Personnel members for Owner / Reviewer selects (sorted). */
  const personnelMembers = useMemo(() => {
    return [...profiles].sort((a, b) =>
      a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }),
    );
  }, [profiles]);

  const [tab, setTab] = useState<Tab>("overview");
  const [snap, setSnap] = useState<SecuritySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null);
  const [issueCycleFilter, setIssueCycleFilter] = useState<string>("all");

  const [cycleModal, setCycleModal] = useState<null | { mode: "create" } | { mode: "edit"; cycle: SecurityCycle }>(
    null,
  );
  const [issueModal, setIssueModal] = useState<null | { mode: "create" | "edit"; issue?: SecurityIssue }>(
    null,
  );

  const visibleProjects = useMemo(
    () => projects.filter((p) => p.name !== PROJECT_COLUMNS_META_NAME),
    [projects],
  );

  const projectPickerOptions = useMemo(
    () =>
      visibleProjects.map((p) => ({
        id: p.id,
        name: p.name,
        blurb: [p.platform, p.bios_id].filter(Boolean).join(" · "),
      })),
    [visibleProjects],
  );

  const profileName = useCallback(
    (id: string | null) => {
      if (!id) return null;
      return profiles.find((p) => p.id === id)?.display_name ?? null;
    },
    [profiles],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await securityStore.load();
      setSnap(next);
      setActiveCycleId((prev) => {
        if (prev && next.cycles.some((c) => c.id === prev)) return prev;
        return next.cycles[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSnap({ cycles: [], roster: [], issues: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cycles = snap?.cycles ?? [];
  const activeCycle = cycles.find((c) => c.id === activeCycleId) ?? cycles[0] ?? null;

  const cycleRoster = useMemo(() => {
    if (!snap || !activeCycle) return [] as SecurityRosterEntry[];
    const rows = snap.roster
      .filter((r) => r.cycle_id === activeCycle.id)
      .slice()
      .sort((a, b) => {
        const waveRank = (w: string) => (w === "Wave 1" ? 0 : w === "Wave 2" ? 1 : 2);
        const d = waveRank(a.wave) - waveRank(b.wave);
        if (d !== 0) return d;
        return a.sort_order - b.sort_order || a.project_name.localeCompare(b.project_name);
      });
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.project_name.toLowerCase().includes(q) ||
        r.wave.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        (profileName(r.owner_id) ?? "").toLowerCase().includes(q) ||
        (profileName(r.reviewer_id) ?? "").toLowerCase().includes(q),
    );
  }, [snap, activeCycle, query, profileName]);

  const metrics = useMemo(() => cycleMetrics(cycleRoster), [cycleRoster]);

  const filteredCycles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || tab !== "overview") return cycles;
    return cycles.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.quarter.toLowerCase().includes(q) ||
        snap?.roster.some(
          (r) =>
            r.cycle_id === c.id && r.project_name.toLowerCase().includes(q),
        ),
    );
  }, [cycles, query, tab, snap]);

  const filteredIssues = useMemo(() => {
    if (!snap) return [] as SecurityIssue[];
    let list = snap.issues;
    if (issueCycleFilter !== "all") {
      list = list.filter((i) => i.cycle_ids.includes(issueCycleFilter));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.oem_request_id.toLowerCase().includes(q) ||
          i.detail.toLowerCase().includes(q) ||
          i.project_names.toLowerCase().includes(q),
      );
    }
    return list;
  }, [snap, issueCycleFilter, query]);

  const issueCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cycles) map.set(c.id, 0);
    for (const issue of snap?.issues ?? []) {
      for (const cid of issue.cycle_ids) {
        map.set(cid, (map.get(cid) ?? 0) + 1);
      }
    }
    return map;
  }, [cycles, snap]);

  const patchRoster = async (
    id: string,
    patch: Partial<Pick<SecurityRosterEntry, "wave" | "owner_id" | "reviewer_id" | "status">>,
  ) => {
    setError("");
    try {
      await runSave(async () => {
        const updated = await securityStore.updateRosterEntry(id, patch);
        setSnap((prev) =>
          prev
            ? { ...prev, roster: prev.roster.map((r) => (r.id === updated.id ? updated : r)) }
            : prev,
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const showBoot = initialLoading || (loading && !snap);

  return (
    <div className="sec-page">
      <header className="sec-toolbar">
        <nav className="sec-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="sec-bc-home" onClick={onGoDashboard} aria-label="Dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </button>
          <button type="button" className="sec-bc-link" onClick={onGoDashboard}>
            Dashboard
          </button>
          <span className="sec-bc-sep" aria-hidden="true">
            /
          </span>
          {tab === "issues" ? (
            <>
              <button type="button" className="sec-bc-link" onClick={() => setTab("overview")}>
                BIOS Security Updates
              </button>
              <span className="sec-bc-sep" aria-hidden="true">
                /
              </span>
              <span className="sec-bc-current">Issue Summary</span>
            </>
          ) : (
            <span className="sec-bc-current">BIOS Security Updates</span>
          )}
        </nav>

        <div className="sec-toolbar-actions">
          <SavingIndicator status={saveStatus} />
          <button
            type="button"
            className="sec-toggle-btn"
            onClick={() => setTab((t) => (t === "overview" ? "issues" : "overview"))}
          >
            {tab === "overview" ? "Issue summary" : "Overview"}
          </button>
          <label className="sec-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cycles or projects"
              aria-label="Search cycles or projects"
            />
          </label>
          <button type="button" className="sec-icon-btn" onClick={() => void refresh()} aria-label="Refresh">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-2.6-6.2" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="sec-body">
        {error && <p className="sec-error">{error}</p>}

        {showBoot ? (
          <div className="sec-loading" role="status" aria-busy="true">
            <LoadingIndicator />
            <span>Loading project roster...</span>
          </div>
        ) : tab === "overview" ? (
          <OverviewPanel
            cycles={filteredCycles.length ? filteredCycles : cycles}
            allCycles={cycles}
            activeCycle={activeCycle}
            roster={cycleRoster}
            metrics={metrics}
            projects={visibleProjects}
            personnel={personnelMembers}
            profileName={profileName}
            onSelectCycle={setActiveCycleId}
            onNewCycle={() => setCycleModal({ mode: "create" })}
            onEditCycle={() => {
              if (activeCycle) setCycleModal({ mode: "edit", cycle: activeCycle });
            }}
            onPatchRoster={patchRoster}
          />
        ) : (
          <IssueSummaryPanel
            cycles={cycles}
            issues={filteredIssues}
            totalIssueCount={snap?.issues.length ?? 0}
            issueCounts={issueCounts}
            filter={issueCycleFilter}
            onFilter={setIssueCycleFilter}
            onAdd={() => setIssueModal({ mode: "create" })}
            onEdit={(issue) => setIssueModal({ mode: "edit", issue })}
          />
        )}
      </div>

      {cycleModal && (
        <CycleFormModal
          mode={cycleModal.mode}
          cycle={cycleModal.mode === "edit" ? cycleModal.cycle : null}
          roster={
            cycleModal.mode === "edit"
              ? (snap?.roster.filter((r) => r.cycle_id === cycleModal.cycle.id) ?? [])
              : []
          }
          projects={projectPickerOptions}
          onClose={() => setCycleModal(null)}
          onSubmit={async (input) => {
            setError("");
            try {
              if (cycleModal.mode === "edit") {
                await runSave(() => securityStore.updateCycle(cycleModal.cycle.id, input));
                setCycleModal(null);
                await refresh();
              } else {
                const cycle = await runSave(() => securityStore.createCycle(input));
                setCycleModal(null);
                await refresh();
                setActiveCycleId(cycle.id);
                setTab("overview");
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
              throw err;
            }
          }}
        />
      )}

      {issueModal && (
        <IssueModal
          mode={issueModal.mode}
          issue={issueModal.issue}
          cycles={cycles}
          projects={visibleProjects}
          onClose={() => setIssueModal(null)}
          onSave={async (input) => {
            setError("");
            try {
              await runSave(async () => {
                if (issueModal.mode === "edit" && issueModal.issue) {
                  await securityStore.updateIssue(issueModal.issue.id, input);
                } else {
                  await securityStore.createIssue(input);
                }
              });
              setIssueModal(null);
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      )}
    </div>
  );
}

function OverviewPanel({
  cycles,
  allCycles,
  activeCycle,
  roster,
  metrics,
  projects,
  personnel,
  profileName,
  onSelectCycle,
  onNewCycle,
  onEditCycle,
  onPatchRoster,
}: {
  cycles: SecurityCycle[];
  allCycles: SecurityCycle[];
  activeCycle: SecurityCycle | null;
  roster: SecurityRosterEntry[];
  metrics: ReturnType<typeof cycleMetrics>;
  projects: { id: string; name: string; lenovo_name?: string }[];
  personnel: Profile[];
  profileName: (id: string | null) => string | null;
  onSelectCycle: (id: string) => void;
  onNewCycle: () => void;
  onEditCycle: () => void;
  onPatchRoster: (
    id: string,
    patch: Partial<Pick<SecurityRosterEntry, "wave" | "owner_id" | "reviewer_id" | "status">>,
  ) => void;
}) {
  const projectById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; lenovo_name?: string }>();
    for (const p of projects) map.set(p.id, p);
    // Also index by Compal name for seed/legacy roster rows whose project_id is not a UUID.
    for (const p of projects) {
      if (p.name && !map.has(p.name)) map.set(p.name, p);
    }
    return map;
  }, [projects]);

  const cycleWaves = normalizeCycleWaves(
    activeCycle ?? { waves: [], wave1_date: "", wave2_date: "", external_release_date: "" },
  );
  const waveSelectOptions = rosterWaveOptions(activeCycle);

  const timeline = cycleWaves
    .map((w) => {
      const d = securityDisplayDate(w.target_date);
      return d ? `${w.name} ${d}` : w.name;
    })
    .join(" · ");

  const otherFooter = allCycles
    .filter((c) => c.id !== activeCycle?.id)
    .map((c) => `${c.quarter} · ${c.project_ids.length} projects`)
    .join(" · ");

  return (
    <>
      <section className="sec-cycle-card" aria-label="Active cycle">
        <div className="sec-cycle-main">
          <p className="sec-cycle-label">Active cycle</p>
          <h1 className="sec-cycle-title">{activeCycle?.name || "—"}</h1>
          <p className="sec-cycle-sub">
            {metrics.total} projects across {metrics.waves} waves
          </p>
          {timeline ? (
            <p className="sec-cycle-timeline">{timeline}</p>
          ) : (
            <p className="sec-cycle-timeline is-empty">No waves yet</p>
          )}
        </div>
        <div className="sec-cycle-metrics" aria-label="Cycle metrics">
          <Metric label="Internal release" value={metrics.internal} total={metrics.total} tone="warn" />
          <Metric label="SA BVT" value={metrics.saBvt} total={metrics.total} tone="link" />
          <Metric label="Completed" value={metrics.completed} total={metrics.total} tone="ok" />
        </div>
        <div className="sec-cycle-actions">
          <button
            type="button"
            className="sec-edit-cycle"
            onClick={onEditCycle}
            disabled={!activeCycle}
          >
            Edit
          </button>
          <button type="button" className="sec-new-cycle" onClick={onNewCycle}>
            <span aria-hidden="true">+</span> New cycle
          </button>
        </div>
      </section>

      <div className="sec-cycle-pills" role="tablist" aria-label="Cycles">
        {cycles.map((c) => {
          const count = c.project_ids.length;
          const active = c.id === activeCycle?.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`sec-cycle-pill${active ? " is-active" : ""}`}
              onClick={() => onSelectCycle(c.id)}
            >
              <span>{c.quarter}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>

      <section className="sec-roster" aria-label="Project roster">
        <div className="sec-roster-head">
          <h2>Project roster</h2>
          <p>
            {roster.length} entries · sorted by wave
          </p>
        </div>
        <div className="sec-roster-table-wrap">
          <table className="sec-roster-table">
            <thead>
              <tr>
                <th>Compal Project name</th>
                <th>LENOVO PROJECT NAME</th>
                <th>
                  Wave <span className="sec-th-affordance" aria-hidden="true">+</span>
                </th>
                <th>Owner</th>
                <th>
                  Reviewer <span className="sec-th-affordance" aria-hidden="true">+</span>
                </th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sec-roster-empty">
                    0 entries
                  </td>
                </tr>
              ) : (
                roster.map((row) => {
                  const options =
                    row.wave !== "Not set" && !waveSelectOptions.includes(row.wave)
                      ? [...waveSelectOptions, row.wave]
                      : waveSelectOptions;
                  const linked =
                    projectById.get(row.project_id) ?? projectById.get(row.project_name);
                  const lenovoName = (linked?.lenovo_name ?? "").trim() || "—";
                  return (
                  <tr key={row.id}>
                    <td className="sec-proj-name">{row.project_name}</td>
                    <td className="sec-lenovo-name">{lenovoName}</td>
                    <td>
                      <label className="sec-wave-cell">
                        <span
                          className={`sec-dot${row.wave === "Not set" ? " is-teal" : " is-ok"}`}
                          aria-hidden="true"
                        />
                        <select
                          className="sec-roster-select"
                          value={options.includes(row.wave) ? row.wave : "Not set"}
                          onChange={(e) => onPatchRoster(row.id, { wave: e.target.value })}
                          aria-label={`Wave for ${row.project_name}`}
                        >
                          {options.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td>
                      <PersonCell
                        name={profileName(row.owner_id)}
                        personnel={personnel}
                        value={row.owner_id}
                        onChange={(owner_id) => onPatchRoster(row.id, { owner_id })}
                        ariaLabel={`Owner for ${row.project_name}`}
                      />
                    </td>
                    <td>
                      <PersonCell
                        name={profileName(row.reviewer_id)}
                        personnel={personnel}
                        value={row.reviewer_id}
                        onChange={(reviewer_id) => onPatchRoster(row.id, { reviewer_id })}
                        ariaLabel={`Reviewer for ${row.project_name}`}
                      />
                    </td>
                    <td>
                      <label className="sec-status-pill">
                        <span
                          className={`sec-dot${
                            row.status === "Completed"
                              ? " is-ok"
                              : row.status === "Not Started"
                                ? " is-muted"
                                : " is-warn"
                          }`}
                          aria-hidden="true"
                        />
                        <select
                          className="sec-roster-select"
                          value={row.status}
                          onChange={(e) =>
                            onPatchRoster(row.id, { status: e.target.value as SecurityRosterStatus })
                          }
                          aria-label={`Status for ${row.project_name}`}
                        >
                          {SECURITY_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {otherFooter ? <p className="sec-roster-footer">{otherFooter}</p> : null}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "warn" | "link" | "ok";
}) {
  return (
    <div className={`sec-metric sec-metric-${tone}`}>
      <span className="sec-metric-label">{label}</span>
      <span className="sec-metric-value">
        <strong>{value}</strong>
        <span> of {total}</span>
      </span>
    </div>
  );
}

function PersonCell({
  name,
  personnel,
  value,
  onChange,
  ariaLabel,
}: {
  name: string | null;
  personnel: Profile[];
  value: string | null;
  onChange: (id: string | null) => void;
  ariaLabel: string;
}) {
  return (
    <label className="sec-person-cell">
      <span className="sec-avatar" aria-hidden="true">
        {name ? initials(name) : "—"}
      </span>
      <select
        className="sec-roster-select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={ariaLabel}
      >
        <option value="">—</option>
        {personnel.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name}
            {p.username ? ` (${p.username})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function IssueSummaryPanel({
  cycles,
  issues,
  totalIssueCount,
  issueCounts,
  filter,
  onFilter,
  onAdd,
  onEdit,
}: {
  cycles: SecurityCycle[];
  issues: SecurityIssue[];
  totalIssueCount: number;
  issueCounts: Map<string, number>;
  filter: string;
  onFilter: (id: string) => void;
  onAdd: () => void;
  onEdit: (issue: SecurityIssue) => void;
}) {
  return (
    <section className="sec-issues" aria-label="Issue Summary">
      <div className="sec-issues-head">
        <div>
          <h1>Issue Summary</h1>
          <p>Create each security update item once, then reuse it in any cycle.</p>
        </div>
        <button type="button" className="sec-add-issue" onClick={onAdd} aria-label="Add issue">
          +
        </button>
      </div>

      <div className="sec-issue-filters" role="tablist" aria-label="Filter by cycle">
        <button
          type="button"
          className={`sec-issue-filter${filter === "all" ? " is-active" : ""}`}
          onClick={() => onFilter("all")}
        >
          All <strong>{totalIssueCount}</strong>
        </button>
        {cycles.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={`sec-issue-filter ${cycleTone(i)}${filter === c.id ? " is-active" : ""}`}
            onClick={() => onFilter(c.id)}
          >
            {c.quarter} <strong>{issueCounts.get(c.id) ?? 0}</strong>
          </button>
        ))}
      </div>

      <ul className="sec-issue-list">
        {issues.length === 0 ? (
          <li className="sec-issue-empty">No security update items yet.</li>
        ) : (
          issues.map((issue) => (
            <li key={issue.id} className="sec-issue-card">
              <div className="sec-issue-card-top">
                <h3>{issue.title}</h3>
                <button type="button" className="sec-edit-btn" onClick={() => onEdit(issue)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  Edit
                </button>
              </div>
              <dl className="sec-issue-meta">
                <div>
                  <dt>OEM Request ID</dt>
                  <dd>{issue.oem_request_id || "—"}</dd>
                </div>
                {issue.detail ? (
                  <div className="sec-issue-detail">
                    <dd>{issue.detail}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Cycles</dt>
                  <dd className="sec-issue-cycles">
                    {issue.cycle_ids.length === 0
                      ? "—"
                      : issue.cycle_ids.map((cid) => {
                          const idx = cycles.findIndex((c) => c.id === cid);
                          const c = cycles[idx];
                          if (!c) return null;
                          return (
                            <span key={cid} className={`sec-mini-pill ${cycleTone(Math.max(0, idx))}`}>
                              {c.quarter}
                            </span>
                          );
                        })}
                  </dd>
                </div>
                <div>
                  <dt>Projects</dt>
                  <dd className="sec-issue-projects">{issue.project_names || "—"}</dd>
                </div>
              </dl>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function CycleFormModal({
  mode,
  cycle,
  roster,
  projects,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  cycle: SecurityCycle | null;
  roster: SecurityRosterEntry[];
  projects: { id: string; name: string; blurb: string }[];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    cycle_type: string;
    quarter: string;
    wave1_date: string;
    wave2_date: string;
    external_release_date: string;
    waves: SecurityWave[];
    projects: { id: string; name: string }[];
  }) => Promise<void>;
}) {
  const isEdit = mode === "edit";
  const quarterDefault = defaultQuarterLabel();

  const [name, setName] = useState(isEdit && cycle ? cycle.name : `${quarterDefault} AIO`);
  const [cycleType, setCycleType] = useState(isEdit && cycle ? cycle.cycle_type : "Quarter");
  const [quarter, setQuarter] = useState(isEdit && cycle ? cycle.quarter : quarterDefault);
  const [waves, setWaves] = useState<SecurityWave[]>(() => {
    if (isEdit && cycle) {
      const w = normalizeCycleWaves(cycle);
      if (w.length > 0) return w.map((x) => ({ ...x, id: x.id || newWaveId() }));
      return [
        { id: newWaveId(), name: "Wave 1", target_date: "" },
        { id: newWaveId(), name: "Wave 2", target_date: "" },
      ];
    }
    return [
      { id: newWaveId(), name: "Wave 1", target_date: "" },
      { id: newWaveId(), name: "Wave 2", target_date: "" },
      { id: newWaveId(), name: "External Release", target_date: "" },
    ];
  });
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (isEdit) return new Set(roster.map((r) => r.project_id));
    return new Set();
  });
  /** Freeze project id order when the modal opens so checking boxes never reorders the list. */
  const [projectOrder] = useState(() => projects.map((p) => p.id));
  const [projQuery, setProjQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const filtered = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const ordered: { id: string; name: string; blurb: string }[] = [];
    for (const id of projectOrder) {
      const p = byId.get(id);
      if (p) ordered.push(p);
    }
    for (const p of projects) {
      if (!projectOrder.includes(p.id)) ordered.push(p);
    }
    const q = projQuery.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.blurb.toLowerCase().includes(q),
    );
  }, [projects, projectOrder, projQuery]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateWave = (id: string, patch: Partial<Pick<SecurityWave, "name" | "target_date">>) => {
    setWaves((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const addWave = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setWaves((prev) => [
      ...prev,
      { id: newWaveId(), name: `Wave ${prev.length + 1}`, target_date: "" },
    ]);
  };

  const removeWave = (e: ReactMouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setWaves((prev) => (prev.length <= 1 ? prev : prev.filter((w) => w.id !== id)));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim() || !quarter.trim()) {
      setFormError("Name and quarter are required");
      return;
    }
    const cleanedWaves = waves
      .map((w, i) => ({
        ...w,
        name: w.name.trim() || `Wave ${i + 1}`,
        target_date: w.target_date.trim(),
      }))
      .filter((w) => w.name);
    if (cleanedWaves.length === 0) {
      setFormError("Add at least one wave");
      return;
    }
    if (selected.size === 0) {
      setFormError("Select at least one project");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        name,
        cycle_type: cycleType,
        quarter,
        wave1_date: cleanedWaves[0]?.target_date ?? "",
        wave2_date: cleanedWaves[1]?.target_date ?? "",
        external_release_date: cleanedWaves[2]?.target_date ?? "",
        waves: cleanedWaves,
        projects: projectOrder
          .map((id) => projects.find((p) => p.id === id))
          .filter((p): p is { id: string; name: string; blurb: string } => Boolean(p) && selected.has(p!.id))
          .map((p) => ({ id: p.id, name: p.name })),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sec-modal-backdrop" onClick={onClose}>
      <form
        className="sec-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
      >
        <div className="sec-modal-head">
          <div>
            <h2>{isEdit ? "Edit Security Update Cycle" : "Add Security Update Cycle"}</h2>
            <p>Define release targets and choose the projects needed for this update</p>
          </div>
          <button type="button" className="sec-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label className="sec-field">
          <span>Canonical name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="sec-field-row">
          <label className="sec-field">
            <span>Cycle type *</span>
            <select value={cycleType} onChange={(e) => setCycleType(e.target.value)}>
              <option value="Quarter">Quarter</option>
              <option value="Custom">Custom</option>
            </select>
          </label>
          <label className="sec-field">
            <span>Quarter *</span>
            <input value={quarter} onChange={(e) => setQuarter(e.target.value)} required placeholder="2026 Q4" />
          </label>
        </div>

        <div className="sec-waves-fields">
          <div className="sec-waves-fields-head">
            <span>Waves *</span>
            <button type="button" className="sec-add-wave-link" onClick={addWave}>
              + Add wave
            </button>
          </div>
          <div className="sec-waves-grid">
            {waves.map((w, i) => (
              <div key={w.id} className="sec-wave-field">
                <div className="sec-wave-field-label">
                  <input
                    type="text"
                    className="sec-wave-name-input"
                    value={w.name}
                    onChange={(e) => updateWave(w.id, { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Wave ${i + 1} name`}
                    placeholder="Wave name"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="sec-wave-remove"
                    onClick={(e) => removeWave(e, w.id)}
                    disabled={waves.length <= 1}
                    aria-label={`Remove ${w.name || `wave ${i + 1}`}`}
                  >
                    ×
                  </button>
                </div>
                <input
                  type="date"
                  className="sec-wave-date-input"
                  value={w.target_date}
                  onChange={(e) => updateWave(w.id, { target_date: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${w.name || `Wave ${i + 1}`} target date`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="sec-projects-picker">
          <div className="sec-projects-picker-head">
            <span>Update Projects *</span>
            <span className="sec-muted">
              Selected {selected.size} of {projects.length}
            </span>
          </div>
          <label className="sec-search sec-search-block">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
            <input
              value={projQuery}
              onChange={(e) => setProjQuery(e.target.value)}
              placeholder="Search project code, name, platform or BIOS ID..."
            />
          </label>
          <ul className="sec-project-checklist">
            {filtered.length === 0 ? (
              <li className="sec-muted">No projects match</li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="sec-check-name">{p.name}</span>
                    {p.blurb ? <span className="sec-check-blurb">{p.blurb}</span> : null}
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>

        {formError ? <p className="sec-error">{formError}</p> : null}

        <div className="sec-modal-actions">
          <button type="button" className="sec-btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="sec-btn-primary" disabled={busy}>
            {busy ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create cycle"}
          </button>
        </div>
      </form>
    </div>
  );
}

function IssueModal({
  mode,
  issue,
  cycles,
  projects,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  issue?: SecurityIssue;
  cycles: SecurityCycle[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSave: (input: {
    title: string;
    oem_request_id?: string;
    detail?: string;
    cycle_ids?: string[];
    project_ids?: string[];
    project_names?: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(issue?.title ?? "");
  const [oem, setOem] = useState(issue?.oem_request_id ?? "");
  const [detail, setDetail] = useState(issue?.detail ?? "");
  const [cycleIds, setCycleIds] = useState<Set<string>>(new Set(issue?.cycle_ids ?? []));
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set(issue?.project_ids ?? []));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const toggleCycle = (id: string) => {
    setCycleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProject = (id: string) => {
    setProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Title is required");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const selectedProjects = projects.filter((p) => projectIds.has(p.id));
      await onSave({
        title,
        oem_request_id: oem,
        detail,
        cycle_ids: [...cycleIds],
        project_ids: selectedProjects.map((p) => p.id),
        project_names: selectedProjects.map((p) => p.name).join(", "),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sec-modal-backdrop" onClick={onClose}>
      <form className="sec-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <div className="sec-modal-head">
          <div>
            <h2>{mode === "edit" ? "Edit security update item" : "Add security update item"}</h2>
            <p>Reuse the same item across any cycle.</p>
          </div>
          <button type="button" className="sec-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label className="sec-field">
          <span>Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="sec-field">
          <span>OEM Request ID</span>
          <input value={oem} onChange={(e) => setOem(e.target.value)} />
        </label>
        <label className="sec-field">
          <span>Detail</span>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
        </label>

        <fieldset className="sec-fieldset">
          <legend>Cycles</legend>
          <div className="sec-check-grid">
            {cycles.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={cycleIds.has(c.id)}
                  onChange={() => toggleCycle(c.id)}
                />
                {c.quarter}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="sec-fieldset">
          <legend>Projects</legend>
          <div className="sec-check-grid sec-check-grid-scroll">
            {projects.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={projectIds.has(p.id)}
                  onChange={() => toggleProject(p.id)}
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>

        {formError ? <p className="sec-error">{formError}</p> : null}

        <div className="sec-modal-actions">
          <button type="button" className="sec-btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="sec-btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
