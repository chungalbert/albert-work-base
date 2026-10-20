import { lazy, Suspense, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { StoreProvider, useStore } from "./context/StoreContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsIssuesPage } from "./pages/ProjectsIssuesPage";
import { PeoplePage } from "./pages/PeoplePage";
import { GuidesPage } from "./pages/GuidesPage";
import { NotesPage } from "./pages/NotesPage";
import { AppToolbar } from "./components/AppToolbar";
import { ReminderBanner } from "./components/ReminderBanner";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import type { ViewId } from "./lib/types";
import { ALL_PROJECTS_ID } from "./lib/projects";
import { roleLabel } from "./lib/roles";

const GanttPage = lazy(() => import("./pages/GanttPage").then((m) => ({ default: m.GanttPage })));

type NavItem = { id: ViewId; label: string; icon: string };
type NavGroup = { key: string; label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    key: "workspace",
    label: "WORKSPACE",
    items: [
      { id: "home", label: "Dashboard", icon: "grid" },
      { id: "projects", label: "Projects & Issues", icon: "folder" },
      { id: "gantt", label: "Project schedule", icon: "calendar" },
    ],
  },
  {
    key: "feature",
    label: "FEATURE",
    items: [
      { id: "guides", label: "教學", icon: "book" },
      { id: "notes", label: "Note", icon: "note" },
    ],
  },
  {
    key: "management",
    label: "MANAGEMENT",
    items: [
      { id: "people", label: "Personnel", icon: "users" },
    ],
  },
];

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          <rect x="2" y="6" width="20" height="14" rx="2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 0-2 2V5z" />
          <path d="M6 3v16" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19a6 6 0 0 1 12 0" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15.5 19a4.5 4.5 0 0 1 5.5 0" />
        </svg>
      );
    default:
      return null;
  }
}

function Shell() {
  const { user, signOut } = useAuth();
  const { projects, projectId, setProjectId, role } = useStore();
  const [view, setView] = useState<ViewId>("home");
  const [showPassword, setShowPassword] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    workspace: true,
    feature: true,
    management: true,
  });
  const isLeader = Boolean(user?.is_admin || role === "leader");
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: isLeader ? group.items : group.items.filter((item) => item.id !== "people"),
  })).filter((group) => group.items.length > 0);

  const currentView = !isLeader && view === "people"
    ? "home"
    : view === "tasks"
      ? "projects"
      : view;
  const initial = (user?.display_name || user?.username || "?").trim().charAt(0).toUpperCase();
  const isProjectIssue = currentView === "projects";
  const isPersonnel = currentView === "people";
  const isNotes = currentView === "notes";
  const hideChrome = isProjectIssue || isPersonnel || isNotes;

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      className={`app shell${isProjectIssue ? " shell-pi" : ""}${isPersonnel ? " shell-personnel" : ""}${isNotes ? " shell-note" : ""}`}
    >
      <aside className="sidebar" aria-label="KSSW navigation">
        <a className="sidebar-brand" href="./" onClick={(e) => { e.preventDefault(); setView("home"); }}>
          <span className="sidebar-brand-name">KSSW</span>
        </a>

        <nav className="sidebar-nav">
          {groups.map((group) => {
            const open = openGroups[group.key] !== false;
            return (
              <div key={group.key} className="nav-group">
                <button
                  type="button"
                  className="nav-group-label"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={open}
                >
                  <span>{group.label}</span>
                  <span className={`chev ${open ? "open" : ""}`} aria-hidden="true">▾</span>
                </button>
                {open && (
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={currentView === item.id ? "on" : ""}
                          onClick={() => setView(item.id)}
                        >
                          <NavIcon name={item.icon} />
                          <span>{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar" aria-hidden="true">
              {initial}
              <span className="online-dot" />
            </div>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">{user?.display_name}</span>
              <span className="sidebar-user-role">{roleLabel(Boolean(user?.is_admin), role)}</span>
            </div>
            <button
              type="button"
              className="bell-btn"
              aria-label="Notifications"
              title="Reminders & alerts"
              onClick={() => setView("home")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </svg>
            </button>
          </div>
          <button type="button" className="logout-btn" onClick={() => void signOut()}>
            → LOGOUT
          </button>
          <button type="button" className="sidebar-link" onClick={() => setShowPassword(true)}>
            Change password
          </button>
        </div>
      </aside>

      <div className="shell-main">
        {!hideChrome && (
          <AppToolbar
            view={currentView}
            onGoDashboard={() => setView("home")}
            trailing={
              currentView === "home" || currentView === "gantt" ? (
                <select
                  className="proj-select"
                  value={projectId ?? ""}
                  onChange={(e) => setProjectId(e.target.value)}
                  aria-label="Project filter"
                >
                  {projects.length === 0 && <option value="">No projects</option>}
                  {projects.length > 0 && <option value={ALL_PROJECTS_ID}>All Projects</option>}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : null
            }
          />
        )}

        <main
          className={`page page-shell${isProjectIssue ? " page-pi" : ""}${isPersonnel ? " page-personnel" : ""}${isNotes ? " page-note" : ""}`}
        >
          {!hideChrome && currentView !== "guides" && <ReminderBanner />}
          {currentView === "home" && <DashboardPage />}
          {currentView === "projects" && (
            <ProjectsIssuesPage onGoDashboard={() => setView("home")} />
          )}
          {currentView === "people" && (
            <PeoplePage onGoDashboard={() => setView("home")} />
          )}
          {currentView === "gantt" && (
            <Suspense fallback={<p className="hint">Loading schedule…</p>}>
              <GanttPage />
            </Suspense>
          )}
          {currentView === "guides" && <GuidesPage />}
          {currentView === "notes" && (
            <NotesPage onGoDashboard={() => setView("home")} />
          )}
        </main>
      </div>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="app landing-app">
        <p className="hint" style={{ padding: 40 }}>Loading…</p>
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
