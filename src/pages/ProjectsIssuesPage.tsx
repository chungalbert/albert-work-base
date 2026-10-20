import { FormEvent, useMemo, useState } from "react";
import {
  addAnalyzedNote,
  analyzedNoteCredit,
  makeAnalyzedNote,
  syncAnalyzedFields,
  updateAnalyzedNote,
} from "../lib/analyzed";
import { api } from "../lib/api";
import { addDaysISO, todayISO } from "../lib/dates";
import { isTaskOpen, TASK_STATUSES, type AnalyzedNote, type Profile, type Task, type TaskStatus } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

type StatusFilter = "all" | TaskStatus;

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function statusTone(status: TaskStatus): string {
  return `pi-state pi-state-${status}`;
}

function AnalysisInline({
  notes,
  profiles,
  canEdit,
  userId,
  onSave,
}: {
  notes: AnalyzedNote[];
  profiles: Profile[];
  canEdit: boolean;
  userId: string | undefined;
  onSave: (next: AnalyzedNote[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value || !userId) return;
    setDraft("");
    onSave(addAnalyzedNote(notes, value, userId));
  };

  return (
    <div className="pi-analysis">
      {notes.map((note) => {
        const credit = analyzedNoteCredit(note, profiles);
        return (
          <div key={note.id} className="pi-analysis-note">
            <p>{note.text}</p>
            {credit && <span className="pi-muted">{credit}</span>}
            {canEdit && (
              <button
                type="button"
                className="pi-linkish"
                onClick={() => {
                  const next = window.prompt("Edit analysis", note.text);
                  if (next == null || !userId) return;
                  onSave(updateAnalyzedNote(notes, note.id, next, userId));
                }}
              >
                Edit
              </button>
            )}
          </div>
        );
      })}
      {canEdit && (
        <div className="pi-analysis-add">
          <textarea
            rows={2}
            value={draft}
            placeholder={notes.length ? "Add analysis note" : "Analysis"}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" disabled={!draft.trim()} onClick={add}>
            Add
          </button>
        </div>
      )}
      {!canEdit && notes.length === 0 && <span className="pi-muted">—</span>}
    </div>
  );
}

export function ProjectsIssuesPage({ onGoDashboard }: { onGoDashboard: () => void }) {
  const { user } = useAuth();
  const {
    projects,
    setProjectId,
    projectId,
    project,
    reload,
    role,
    allTasks,
    profiles,
    allMembers,
    leaderProjectIds,
    canLeadProject,
    members,
  } = useStore();

  const [mode, setMode] = useState<"list" | "detail">("list");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(user?.id ?? "");
  const [start, setStart] = useState(todayISO());
  const [due, setDue] = useState(addDaysISO(todayISO(), 3));
  const [newStatus, setNewStatus] = useState<TaskStatus>("opening");
  const [analyzed, setAnalyzed] = useState("");
  const [showNewIssue, setShowNewIssue] = useState(false);

  const canCreate = Boolean(user?.is_admin || role === "leader");

  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? "Unassigned";

  const leaderOf = (pid: string) => {
    const leader = allMembers.find((m) => m.project_id === pid && m.role === "leader");
    return leader ? nameOf(leader.user_id) : "—";
  };

  const projectRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .map((p) => {
        const tasks = allTasks.filter((t) => t.project_id === p.id);
        const open = tasks.filter((t) => t.status === "opening").length;
        const working = tasks.filter((t) => t.status === "working").length;
        const closing = tasks.filter((t) => t.status === "closing").length;
        const closed = tasks.filter((t) => t.status === "verify").length;
        return {
          project: p,
          open,
          working,
          closing,
          closed,
          total: tasks.length,
          leader: leaderOf(p.id),
          members: allMembers.filter((m) => m.project_id === p.id).length,
        };
      })
      .filter((row) => {
        if (!q) return true;
        const hay = [row.project.name, row.project.description, row.leader].join(" ").toLowerCase();
        return hay.includes(q);
      });
  }, [projects, allTasks, allMembers, profiles, query]);

  const detailTasks = useMemo(() => {
    if (!project) return [] as Task[];
    const q = query.trim().toLowerCase();
    return allTasks
      .filter((t) => t.project_id === project.id)
      .filter((t) => (statusFilter === "all" ? true : t.status === statusFilter))
      .filter((t) => {
        if (!q) return true;
        const hay = [t.title, t.note, t.analyzed, nameOf(t.assignee_id), shortId(t.id)].join(" ").toLowerCase();
        return hay.includes(q);
      });
  }, [allTasks, project, statusFilter, query, profiles]);

  const counts = useMemo(() => {
    const tasks = project ? allTasks.filter((t) => t.project_id === project.id) : [];
    return {
      opening: tasks.filter((t) => t.status === "opening").length,
      working: tasks.filter((t) => t.status === "working").length,
      closing: tasks.filter((t) => t.status === "closing").length,
      verify: tasks.filter((t) => t.status === "verify").length,
      total: tasks.length,
      openish: tasks.filter((t) => isTaskOpen(t.status)).length,
    };
  }, [allTasks, project]);

  const people = members
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const openProject = (id: string) => {
    setProjectId(id);
    setMode("detail");
    setStatusFilter("all");
    setQuery("");
    setMoreOpen(false);
    setShowNewIssue(false);
  };

  const backToList = () => {
    setMode("list");
    setQuery("");
    setStatusFilter("all");
    setShowNewIssue(false);
    setMoreOpen(false);
  };

  const onCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const created = await api.createProject(name, description);
      setName("");
      setDescription("");
      setShowCreate(false);
      setProjectId(created.id);
      await reload();
      setMode("detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const onDeleteProject = async (id: string, projectName: string) => {
    const ok = window.confirm(`Delete “${projectName}”? Tasks and members will be removed.`);
    if (!ok) return;
    setBusyId(id);
    setError("");
    try {
      await api.deleteProject(id);
      if (mode === "detail" && projectId === id) backToList();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId("");
    }
  };

  const createIssue = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || !user) return;
    setError("");
    try {
      await api.createTask({
        project_id: project.id,
        title: title.trim(),
        assignee_id: assignee || null,
        start_date: start,
        due_date: due < start ? start : due,
        status: newStatus,
        note: "",
        ...syncAnalyzedFields(analyzed.trim() ? [makeAnalyzedNote(analyzed, user.id)] : []),
      });
      setTitle("");
      setAnalyzed("");
      setNewStatus("opening");
      setShowNewIssue(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const patchTask = async (id: string, next: Parameters<typeof api.updateTask>[1]) => {
    await api.updateTask(id, next);
    await reload();
  };

  const canManage = Boolean(project && (user?.is_admin || role === "leader"));

  return (
    <div className="pi-page">
      <header className="pi-toolbar">
        <nav className="pi-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="pi-bc-home" onClick={onGoDashboard} aria-label="Dashboard">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </button>
          <button type="button" className="pi-bc-link" onClick={onGoDashboard}>
            Dashboard
          </button>
          <span className="pi-bc-sep" aria-hidden="true">›</span>
          {mode === "list" ? (
            <span className="pi-bc-current">Project</span>
          ) : (
            <>
              <button type="button" className="pi-bc-link" onClick={backToList}>
                Project
              </button>
              <span className="pi-bc-sep" aria-hidden="true">›</span>
              <span className="pi-bc-active">{project?.name ?? "Project"}</span>
            </>
          )}
        </nav>

        <div className="pi-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.34-4.34" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search"
          />
        </div>

        <div className="pi-actions">
          <div className="pi-menu-wrap">
            <button
              type="button"
              className="pi-icon-btn"
              title="Columns"
              aria-label="Project columns"
              aria-expanded={columnsOpen}
              onClick={() => {
                setColumnsOpen((v) => !v);
                setMoreOpen(false);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 5H3M12 19H3M14 3v4M16 17v4M21 12h-9M21 19h-5M21 5h-7M8 10v4M8 12H3" />
              </svg>
            </button>
            {columnsOpen && (
              <div className="pi-popover">
                <p className="pi-popover-title">Visible columns</p>
                <p className="pi-muted">
                  {mode === "list"
                    ? "Name, description, open / working / closed counts, leader, members, actions."
                    : "Number, state, name, owner, dates, analysis, actions."}
                </p>
              </div>
            )}
          </div>

          <button type="button" className="pi-icon-btn pi-icon-btn-primary" title="Saved" aria-label="Saved" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>

          <div className="pi-menu-wrap">
            <button
              type="button"
              className="pi-icon-btn"
              title="More actions"
              aria-label="More actions"
              aria-expanded={moreOpen}
              onClick={() => {
                setMoreOpen((v) => !v);
                setColumnsOpen(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
            {moreOpen && (
              <div className="pi-popover pi-popover-menu">
                {mode === "list" && canCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(true);
                      setMoreOpen(false);
                    }}
                  >
                    + New Project
                  </button>
                )}
                {mode === "detail" && canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewIssue(true);
                      setMoreOpen(false);
                    }}
                  >
                    + New Issue
                  </button>
                )}
                {mode === "detail" && (
                  <button type="button" onClick={backToList}>
                    ← All Projects
                  </button>
                )}
                {mode === "detail" && project && leaderProjectIds.includes(project.id) && (
                  <button
                    type="button"
                    className="danger"
                    disabled={busyId === project.id}
                    onClick={() => void onDeleteProject(project.id, project.name)}
                  >
                    Delete Project
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {error && <p className="pi-error">{error}</p>}

      {mode === "list" && showCreate && canCreate && (
        <form className="pi-create-card" onSubmit={onCreateProject}>
          <h2>New Project</h2>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <div className="pi-create-actions">
            <button type="button" className="pi-btn-ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button type="submit" className="pi-btn-primary">
              Create (you become leader)
            </button>
          </div>
        </form>
      )}

      {mode === "list" ? (
        <div className="pi-table-wrap">
          <table className="pi-table">
            <thead>
              <tr>
                <th>PROJECT NAME</th>
                <th>DESCRIPTION</th>
                <th>OPEN</th>
                <th>WORKING</th>
                <th>CLOSING</th>
                <th>CLOSED</th>
                <th>TOTAL</th>
                <th>LEADER</th>
                <th>MEMBERS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="pi-empty">
                    {projects.length === 0 ? "No projects yet. Use More → New Project." : "No projects match this search."}
                  </td>
                </tr>
              ) : (
                projectRows.map((row) => (
                  <tr key={row.project.id}>
                    <td>
                      <button type="button" className="pi-proj-link" onClick={() => openProject(row.project.id)}>
                        {row.project.name}
                      </button>
                    </td>
                    <td className="pi-desc">{row.project.description || "—"}</td>
                    <td>{row.open}</td>
                    <td>{row.working}</td>
                    <td>{row.closing}</td>
                    <td>{row.closed}</td>
                    <td>{row.total}</td>
                    <td>{row.leader}</td>
                    <td>{row.members}</td>
                    <td>
                      <div className="pi-row-actions">
                        <button type="button" className="pi-linkish" onClick={() => openProject(row.project.id)}>
                          Open
                        </button>
                        {leaderProjectIds.includes(row.project.id) && (
                          <button
                            type="button"
                            className="pi-linkish danger"
                            disabled={busyId === row.project.id}
                            onClick={() => void onDeleteProject(row.project.id, row.project.name)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="pi-status-bar">
            {(
              [
                ["opening", "OPEN", counts.opening],
                ["working", "WORKING", counts.working],
                ["closing", "CLOSING", counts.closing],
                ["verify", "CLOSED", counts.verify],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={`pi-chip${statusFilter === id ? " on" : ""}`}
                onClick={() => setStatusFilter((prev) => (prev === id ? "all" : id))}
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
            <button
              type="button"
              className={`pi-chip pi-chip-total${statusFilter === "all" ? " on" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              <span>TOTAL</span>
              <strong>{counts.total}</strong>
            </button>
          </div>

          {showNewIssue && canManage && (
            <form className="pi-create-card" onSubmit={createIssue}>
              <h2>New Issue · {project?.name}</h2>
              <div className="pi-create-grid">
                <label>
                  Issue name
                  <input value={title} onChange={(e) => setTitle(e.target.value)} required />
                </label>
                <label>
                  Owner
                  <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                    <option value="">Unassigned</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start
                  <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
                </label>
                <label>
                  Deadline
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
                </label>
                <label>
                  State
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as TaskStatus)}>
                    {TASK_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Analysis
                  <textarea rows={3} value={analyzed} onChange={(e) => setAnalyzed(e.target.value)} />
                </label>
              </div>
              <div className="pi-create-actions">
                <button type="button" className="pi-btn-ghost" onClick={() => setShowNewIssue(false)}>
                  Cancel
                </button>
                <button type="submit" className="pi-btn-primary">
                  Add issue
                </button>
              </div>
            </form>
          )}

          <div className="pi-table-wrap">
            <table className="pi-table pi-issue-table">
              <thead>
                <tr>
                  <th>NO.</th>
                  <th>STATE</th>
                  <th>NAME</th>
                  <th>OWNER</th>
                  <th>START</th>
                  <th>DEADLINE</th>
                  <th>ANALYSIS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {detailTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="pi-empty">
                      No issues found.
                    </td>
                  </tr>
                ) : (
                  detailTasks.map((task) => {
                    const canEdit = canLeadProject(task.project_id) || task.assignee_id === user?.id;
                    const canDelete = canLeadProject(task.project_id);
                    const assignees = profiles.filter((p) =>
                      allMembers.some((m) => m.project_id === task.project_id && m.user_id === p.id),
                    );
                    return (
                      <tr key={task.id}>
                        <td className="pi-no">{shortId(task.id)}</td>
                        <td>
                          {canEdit ? (
                            <select
                              className={statusTone(task.status)}
                              value={task.status}
                              onChange={(e) => void patchTask(task.id, { status: e.target.value as TaskStatus })}
                            >
                              {TASK_STATUSES.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.label.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={statusTone(task.status)}>{task.status.toUpperCase()}</span>
                          )}
                        </td>
                        <td className="pi-issue-name">
                          {canEdit ? (
                            <input
                              defaultValue={task.title}
                              key={`${task.id}-${task.title}`}
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                if (next && next !== task.title) void patchTask(task.id, { title: next });
                              }}
                            />
                          ) : (
                            task.title
                          )}
                        </td>
                        <td>
                          {canEdit ? (
                            <select
                              value={task.assignee_id ?? ""}
                              onChange={(e) => void patchTask(task.id, { assignee_id: e.target.value || null })}
                            >
                              <option value="">Unassigned</option>
                              {assignees.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.display_name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            nameOf(task.assignee_id)
                          )}
                        </td>
                        <td>
                          {canEdit ? (
                            <input
                              type="date"
                              value={task.start_date}
                              onChange={(e) => void patchTask(task.id, { start_date: e.target.value })}
                            />
                          ) : (
                            task.start_date
                          )}
                        </td>
                        <td>
                          {canEdit ? (
                            <input
                              type="date"
                              value={task.due_date}
                              onChange={(e) => void patchTask(task.id, { due_date: e.target.value })}
                            />
                          ) : (
                            task.due_date
                          )}
                        </td>
                        <td>
                          <AnalysisInline
                            notes={task.analyzed_notes ?? []}
                            profiles={profiles}
                            canEdit={canEdit}
                            userId={user?.id}
                            onSave={(notes) => void patchTask(task.id, syncAnalyzedFields(notes))}
                          />
                        </td>
                        <td>
                          {canDelete && (
                            <button
                              type="button"
                              className="pi-linkish danger"
                              onClick={() => {
                                if (window.confirm("Delete this issue?")) void api.deleteTask(task.id).then(reload);
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
