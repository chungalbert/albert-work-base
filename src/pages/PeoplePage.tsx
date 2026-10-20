import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  isTaskOpen,
  normalizePersonnelRole,
  PERSONNEL_ROLES,
  type PersonnelColumn,
  type PersonnelRole,
  type Profile,
} from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { DEFAULT_PASSWORD } from "../lib/util";

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; seconds: number };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarTone(name: string): string {
  const tones = ["tone-a", "tone-b", "tone-c", "tone-d", "tone-e", "tone-f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % tones.length;
  return tones[hash];
}

function formatSaveSeconds(ms: number): number {
  return Math.max(0, Math.round(ms / 10) / 100);
}

export function PeoplePage({ onGoDashboard }: { onGoDashboard?: () => void }) {
  const { user } = useAuth();
  const { profiles, allMembers, allTasks, projects, reload } = useStore();
  const isAdmin = Boolean(user && normalizePersonnelRole(user) === "Admin");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [columns, setColumns] = useState<PersonnelColumn[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const saveHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [memberForm, setMemberForm] = useState({
    display_name: "",
    username: "",
    email: "",
    phone: "",
    personnel_role: "DE" as PersonnelRole,
    projectIds: [] as string[],
  });
  const [projectPickerId, setProjectPickerId] = useState<string | null>(null);

  const refreshColumns = async () => {
    setColumns(await api.listPersonnelColumns());
  };

  useEffect(() => {
    void refreshColumns();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setMemberOpen(false);
      setMemberBusy(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    return () => {
      if (saveHideTimer.current) clearTimeout(saveHideTimer.current);
    };
  }, []);

  const runSave = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (saveHideTimer.current) {
      clearTimeout(saveHideTimer.current);
      saveHideTimer.current = null;
    }
    setSaveStatus({ kind: "saving" });
    const started = performance.now();
    try {
      // Optional delay for screenshot / local demos (localStorage AWB_SLOW_SAVE=ms).
      const slow = Number(localStorage.getItem("AWB_SLOW_SAVE") || "0");
      if (slow > 0) await new Promise((r) => setTimeout(r, slow));
      const result = await work();
      const seconds = formatSaveSeconds(performance.now() - started);
      setSaveStatus({ kind: "saved", seconds });
      saveHideTimer.current = setTimeout(() => {
        setSaveStatus({ kind: "idle" });
        saveHideTimer.current = null;
      }, 1000);
      return result;
    } catch (err) {
      setSaveStatus({ kind: "idle" });
      throw err;
    }
  };

  const rows = useMemo(() => {
    return profiles.map((profile) => {
      const memberships = allMembers.filter((m) => m.user_id === profile.id);
      const projectIds = [...new Set(memberships.map((m) => m.project_id))];
      const projectNames = projectIds
        .map((id) => projects.find((p) => p.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      const issues = allTasks.filter(
        (t) => t.assignee_id === profile.id && isTaskOpen(t.status),
      ).length;
      return {
        profile,
        projectIds,
        projectNames,
        projectCount: projectNames.length,
        role: normalizePersonnelRole(profile),
        issues,
      };
    });
  }, [profiles, allMembers, allTasks, projects]);

  const patchProfile = async (
    userId: string,
    patch: Parameters<typeof api.updateProfile>[1],
  ) => {
    setError("");
    setBusyId(userId);
    try {
      await runSave(async () => {
        await api.updateProfile(userId, patch);
        await reload();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId("");
    }
  };

  const setProjects = async (userId: string, projectIds: string[]) => {
    setError("");
    setBusyId(userId);
    try {
      await runSave(async () => {
        await api.setPersonProjects(userId, projectIds);
        await reload();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project update failed");
    } finally {
      setBusyId("");
    }
  };

  const onAddColumn = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await runSave(async () => {
        await api.addPersonnelColumn(newColLabel);
        setNewColLabel("");
        setAddOpen(false);
        await refreshColumns();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add column failed");
    }
  };

  const resetMemberForm = () => {
    setMemberForm({
      display_name: "",
      username: "",
      email: "",
      phone: "",
      personnel_role: "DE",
      projectIds: [],
    });
  };

  const onAddMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin) {
      setError("只有 Admin 可以新增 Member");
      setMemberOpen(false);
      return;
    }
    setError("");
    setMemberBusy(true);
    try {
      await runSave(async () => {
        await api.createPersonnelMember({
          display_name: memberForm.display_name,
          username: memberForm.username || undefined,
          email: memberForm.email,
          phone: memberForm.phone,
          personnel_role: memberForm.personnel_role,
          projectIds: memberForm.projectIds,
        });
        resetMemberForm();
        setMemberOpen(false);
        await reload();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add member failed");
    } finally {
      setMemberBusy(false);
    }
  };

  const onRemoveColumn = async (columnId: string, label: string) => {
    const ok = window.confirm(`Remove column “${label}”? Values will be deleted.`);
    if (!ok) return;
    setError("");
    try {
      await runSave(async () => {
        await api.removePersonnelColumn(columnId);
        await refreshColumns();
        await reload();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove column failed");
    }
  };

  const resetPassword = async (userId: string, name: string) => {
    const ok = window.confirm(`Reset password for “${name}” to ${DEFAULT_PASSWORD}?`);
    if (!ok) return;
    setError("");
    setBusyId(userId);
    try {
      await runSave(async () => {
        await api.resetPassword(userId);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusyId("");
    }
  };

  const deletePerson = async (userId: string, name: string) => {
    const ok = window.confirm(`Delete “${name}”? This removes the account from all projects.`);
    if (!ok) return;
    setError("");
    setBusyId(userId);
    try {
      await runSave(async () => {
        await api.deletePerson(userId);
        await reload();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId("");
    }
  };

  const colSpan = 7 + columns.length;

  return (
    <div className="personnel-page">
      <header className="personnel-toolbar">
        <nav className="personnel-breadcrumb" aria-label="Breadcrumb">
          <button
            type="button"
            className="personnel-bc-home"
            onClick={onGoDashboard}
            aria-label="Dashboard"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </button>
          <button type="button" className="personnel-bc-link" onClick={onGoDashboard}>
            Dashboard
          </button>
          <span className="personnel-bc-sep" aria-hidden="true">›</span>
          <span className="personnel-bc-current">Personnel</span>
        </nav>

        <div className="personnel-toolbar-actions">
          {saveStatus.kind !== "idle" && (
            <div
              className={`personnel-save-status${saveStatus.kind === "saving" ? " is-saving" : " is-saved"}`}
              role="status"
              aria-live="polite"
            >
              {saveStatus.kind === "saving" ? (
                <>
                  <span className="personnel-save-spinner" aria-hidden="true" />
                  <span>Saving</span>
                </>
              ) : (
                <span>Saved {saveStatus.seconds.toFixed(2)}s</span>
              )}
            </div>
          )}
          {isAdmin && (
            <button
              type="button"
              className="personnel-add-col personnel-add-member"
              onClick={() => {
                setAddOpen(false);
                setMemberOpen(true);
              }}
            >
              + ADD MEMBER
            </button>
          )}
          <div className="personnel-add-wrap">
            <button
              type="button"
              className="personnel-add-col"
              aria-expanded={addOpen}
              onClick={() => {
                setMemberOpen(false);
                setAddOpen((v) => !v);
              }}
            >
              + ADD COLUMN
            </button>
            {addOpen && (
              <form className="personnel-add-popover" onSubmit={onAddColumn}>
                <label>
                  Column name
                  <input
                    value={newColLabel}
                    onChange={(e) => setNewColLabel(e.target.value)}
                    placeholder="e.g. Team"
                    autoFocus
                  />
                </label>
                <div className="personnel-add-actions">
                  <button type="button" className="personnel-btn-ghost" onClick={() => setAddOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="personnel-btn-primary" disabled={!newColLabel.trim()}>
                    Add
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </header>

      {isAdmin && memberOpen && (
        <div className="personnel-modal-backdrop" role="presentation" onClick={() => !memberBusy && setMemberOpen(false)}>
          <form
            className="personnel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="personnel-add-member-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onAddMember}
          >
            <header className="personnel-modal-head">
              <h2 id="personnel-add-member-title">新增 Member</h2>
              <button
                type="button"
                className="personnel-modal-close"
                aria-label="Close"
                disabled={memberBusy}
                onClick={() => setMemberOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="personnel-modal-body">
              <label>
                Name
                <input
                  value={memberForm.display_name}
                  onChange={(e) => setMemberForm((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="Display name"
                  autoFocus
                  required
                />
              </label>
              <label>
                Username
                <input
                  value={memberForm.username}
                  onChange={(e) => setMemberForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="Login id (optional if email set)"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={memberForm.email}
                  onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </label>
              <label>
                Phone
                <input
                  value={memberForm.phone}
                  onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label>
                Role
                <select
                  className="personnel-select"
                  value={memberForm.personnel_role}
                  onChange={(e) =>
                    setMemberForm((f) => ({ ...f, personnel_role: e.target.value as PersonnelRole }))
                  }
                >
                  {PERSONNEL_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <fieldset className="personnel-modal-projects">
                <legend>Projects</legend>
                {projects.length === 0 ? (
                  <p className="personnel-muted">No projects yet.</p>
                ) : (
                  projects.map((p) => {
                    const checked = memberForm.projectIds.includes(p.id);
                    return (
                      <label key={p.id} className="personnel-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setMemberForm((f) => ({
                              ...f,
                              projectIds: checked
                                ? f.projectIds.filter((id) => id !== p.id)
                                : [...f.projectIds, p.id],
                            }));
                          }}
                        />
                        {p.name}
                      </label>
                    );
                  })
                )}
              </fieldset>
            </div>
            <footer className="personnel-add-actions">
              <button
                type="button"
                className="personnel-btn-ghost"
                disabled={memberBusy}
                onClick={() => {
                  resetMemberForm();
                  setMemberOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="personnel-btn-primary"
                disabled={
                  memberBusy ||
                  !memberForm.display_name.trim() ||
                  (!memberForm.username.trim() && !memberForm.email.trim())
                }
              >
                {memberBusy ? "Saving…" : "Save member"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {error && <p className="personnel-error">{error}</p>}

      <div className="personnel-table-wrap">
        <table className="personnel-table">
          <thead>
            <tr>
              <th>MEMBER</th>
              <th>ID</th>
              <th>PHONE</th>
              <th>ROLE</th>
              <th>PROJECTS</th>
              {columns.map((col) => (
                <th key={col.id}>
                  <span className="personnel-col-head">
                    {col.label.toUpperCase()}
                    <button
                      type="button"
                      className="personnel-col-remove"
                      title={`Remove ${col.label}`}
                      onClick={() => void onRemoveColumn(col.id, col.label)}
                    >
                      ×
                    </button>
                  </span>
                </th>
              ))}
              <th>ISSUES</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="personnel-empty">No personnel found.</td>
              </tr>
            ) : (
              rows.map(({ profile, projectIds, projectNames, projectCount, role, issues }) => (
                <PersonRow
                  key={profile.id}
                  profile={profile}
                  role={role}
                  projectIds={projectIds}
                  projectNames={projectNames}
                  projectCount={projectCount}
                  issues={issues}
                  columns={columns}
                  projects={projects}
                  busy={busyId === profile.id}
                  pickerOpen={projectPickerId === profile.id}
                  onTogglePicker={() =>
                    setProjectPickerId((id) => (id === profile.id ? null : profile.id))
                  }
                  onPatch={(patch) => void patchProfile(profile.id, patch)}
                  onSetProjects={(ids) => void setProjects(profile.id, ids)}
                  onReset={() => void resetPassword(profile.id, profile.display_name)}
                  onDelete={() => void deletePerson(profile.id, profile.display_name)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PersonRow({
  profile,
  role,
  projectIds,
  projectNames,
  projectCount,
  issues,
  columns,
  projects,
  busy,
  pickerOpen,
  onTogglePicker,
  onPatch,
  onSetProjects,
  onReset,
  onDelete,
}: {
  profile: Profile;
  role: PersonnelRole;
  projectIds: string[];
  projectNames: string[];
  projectCount: number;
  issues: number;
  columns: PersonnelColumn[];
  projects: { id: string; name: string }[];
  busy: boolean;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onPatch: (patch: Parameters<typeof api.updateProfile>[1]) => void;
  onSetProjects: (ids: string[]) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  return (
    <tr>
      <td>
        <div className="personnel-member">
          <span className={`personnel-avatar ${avatarTone(profile.display_name)}`} aria-hidden="true">
            {initials(profile.display_name)}
          </span>
          <div className="personnel-member-fields">
            <input
              className="personnel-input name"
              defaultValue={profile.display_name}
              key={`${profile.id}-name-${profile.display_name}`}
              disabled={busy}
              aria-label="Display name"
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== profile.display_name) onPatch({ display_name: next });
              }}
            />
            <input
              className="personnel-input email"
              defaultValue={profile.email}
              key={`${profile.id}-email-${profile.email}`}
              disabled={busy}
              aria-label="Email"
              onBlur={(e) => {
                const next = e.target.value.trim().toLowerCase();
                if (next && next !== profile.email) onPatch({ email: next });
              }}
            />
          </div>
        </div>
      </td>
      <td className="personnel-mono">{profile.username}</td>
      <td>
        <input
          className="personnel-input"
          defaultValue={profile.unit}
          key={`${profile.id}-phone-${profile.unit}`}
          placeholder="—"
          disabled={busy}
          aria-label="Phone"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (profile.unit ?? "")) onPatch({ unit: next });
          }}
        />
      </td>
      <td>
        <select
          className="personnel-select"
          value={role}
          disabled={busy}
          aria-label="Role"
          onChange={(e) => onPatch({ personnel_role: e.target.value as PersonnelRole })}
        >
          {PERSONNEL_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </td>
      <td>
        <div className="personnel-projects-edit">
          <button type="button" className="personnel-projects-btn" onClick={onTogglePicker} disabled={busy}>
            {projectCount === 0 ? (
              <em className="personnel-unassigned">Unassigned</em>
            ) : (
              <>
                <span>{projectCount} project{projectCount === 1 ? "" : "s"}</span>
                <span className="personnel-project-names">{projectNames.join(", ")}</span>
              </>
            )}
            <span className="personnel-edit-icon" aria-hidden="true">✎</span>
          </button>
          {pickerOpen && (
            <div className="personnel-project-picker">
              {projects.length === 0 ? (
                <p className="personnel-muted">No projects yet.</p>
              ) : (
                projects.map((p) => {
                  const checked = projectIds.includes(p.id);
                  return (
                    <label key={p.id} className="personnel-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => {
                          const next = checked
                            ? projectIds.filter((id) => id !== p.id)
                            : [...projectIds, p.id];
                          onSetProjects(next);
                        }}
                      />
                      {p.name}
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>
      </td>
      {columns.map((col) => (
        <td key={col.id}>
          <input
            className="personnel-input"
            defaultValue={profile.custom?.[col.id] ?? ""}
            key={`${profile.id}-${col.id}-${profile.custom?.[col.id] ?? ""}`}
            disabled={busy}
            aria-label={col.label}
            onBlur={(e) => {
              const next = e.target.value;
              if (next !== (profile.custom?.[col.id] ?? "")) {
                onPatch({ custom: { [col.id]: next } });
              }
            }}
          />
        </td>
      ))}
      <td>
        <span
          className={`personnel-issue-badge${
            issues === 0 ? " zero" : issues >= 5 ? " high" : " mid"
          }`}
        >
          {issues}
        </span>
      </td>
      <td>
        <div className="personnel-actions">
          <button type="button" className="personnel-link" disabled={busy} onClick={onReset}>
            Reset pw
          </button>
          <button type="button" className="personnel-link danger" disabled={busy} onClick={onDelete}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
