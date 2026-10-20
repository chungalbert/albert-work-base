import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { isTaskOpen } from "../lib/types";
import { useStore } from "../context/StoreContext";
import { DEFAULT_PASSWORD } from "../lib/util";

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

function roleLabel(isAdmin: boolean, hasLeader: boolean): string {
  if (isAdmin) return "Admin";
  if (hasLeader) return "Leader";
  return "Member";
}

export function PeoplePage({ onGoDashboard }: { onGoDashboard?: () => void }) {
  const { profiles, allMembers, allTasks, projects, reload } = useStore();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const rows = useMemo(() => {
    return profiles.map((profile) => {
      const memberships = allMembers.filter((m) => m.user_id === profile.id);
      const projectIds = [...new Set(memberships.map((m) => m.project_id))];
      const projectNames = projectIds
        .map((id) => projects.find((p) => p.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      const hasLeader = memberships.some((m) => m.role === "leader");
      const issues = allTasks.filter(
        (t) => t.assignee_id === profile.id && isTaskOpen(t.status),
      ).length;
      return {
        profile,
        projectNames,
        projectCount: projectNames.length,
        role: roleLabel(profile.is_admin, hasLeader),
        issues,
      };
    });
  }, [profiles, allMembers, allTasks, projects]);

  const resetPassword = async (userId: string, name: string) => {
    const ok = window.confirm(`Reset password for “${name}” to ${DEFAULT_PASSWORD}?`);
    if (!ok) return;
    setError("");
    setBusyId(userId);
    try {
      await api.resetPassword(userId);
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
      await api.deletePerson(userId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId("");
    }
  };

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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        <button type="button" className="personnel-add-col" title="Custom columns coming later">
          + ADD COLUMN
        </button>
      </header>

      {error && <p className="personnel-error">{error}</p>}

      <div className="personnel-table-wrap">
        <table className="personnel-table">
          <thead>
            <tr>
              <th>MEMBER</th>
              <th>ID</th>
              <th>PHONE</th>
              <th>COPILOT</th>
              <th>ROLE</th>
              <th>PROJECTS</th>
              <th>ISSUES</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="personnel-empty">No personnel found.</td>
              </tr>
            ) : (
              rows.map(({ profile, projectNames, projectCount, role, issues }) => (
                <tr key={profile.id}>
                  <td>
                    <div className="personnel-member">
                      <span className={`personnel-avatar ${avatarTone(profile.display_name)}`} aria-hidden="true">
                        {initials(profile.display_name)}
                      </span>
                      <div>
                        <strong>{profile.display_name}</strong>
                        <span className="personnel-email">{profile.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="personnel-mono">{profile.username}</td>
                  <td className="personnel-muted">{profile.unit?.trim() || "—"}</td>
                  <td className="personnel-muted">—</td>
                  <td>
                    <span className="personnel-role">{role}</span>
                  </td>
                  <td>
                    <div className="personnel-projects">
                      {projectCount === 0 ? (
                        <em className="personnel-unassigned">Unassigned</em>
                      ) : (
                        <>
                          <span>{projectCount} project{projectCount === 1 ? "" : "s"}</span>
                          <span className="personnel-project-names">{projectNames.join(", ")}</span>
                        </>
                      )}
                    </div>
                  </td>
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
                    {profile.is_admin ? (
                      <span className="personnel-muted">Self-manage</span>
                    ) : (
                      <div className="personnel-actions">
                        <button
                          type="button"
                          className="personnel-link"
                          disabled={busyId === profile.id}
                          onClick={() => void resetPassword(profile.id, profile.display_name)}
                        >
                          Reset pw
                        </button>
                        <button
                          type="button"
                          className="personnel-link danger"
                          disabled={busyId === profile.id}
                          onClick={() => void deletePerson(profile.id, profile.display_name)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
