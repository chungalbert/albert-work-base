import { lazy, Suspense, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { StoreProvider, useStore } from "./context/StoreContext";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { TasksPage } from "./pages/TasksPage";
import { ReportPage } from "./pages/ReportPage";
import { ReminderBanner } from "./components/ReminderBanner";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import type { ViewId } from "./lib/types";
import { roleLabel } from "./lib/roles";

const GanttPage = lazy(() => import("./pages/GanttPage").then((m) => ({ default: m.GanttPage })));

const NAV: { id: ViewId; label: string }[] = [
  { id: "projects", label: "專案" },
  { id: "people", label: "人員" },
  { id: "tasks", label: "任務" },
  { id: "gantt", label: "甘特圖" },
  { id: "report", label: "週報" },
];

function Shell() {
  const { user, signOut } = useAuth();
  const { projects, projectId, setProjectId, role } = useStore();
  const [view, setView] = useState<ViewId>("projects");
  const [showPassword, setShowPassword] = useState(false);
  const isLeader = Boolean(user?.is_admin || role === "leader");
  const nav = isLeader ? NAV : NAV.filter((item) => item.id !== "people");
  const currentView = !isLeader && view === "people" ? "projects" : view;

  return (
    <div className="app">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="./">
            <span className="mark" aria-hidden="true">⚡</span>
            <span className="brand-name">Albert 工作基地</span>
          </a>
          <div className="header-right">
            <nav className="header-nav" aria-label="主選單">
              {nav.map((item) => (
                <button
                  key={item.id}
                  className={currentView === item.id ? "on" : ""}
                  type="button"
                  onClick={() => setView(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <select
              className="proj-select"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="專案"
            >
              {projects.length === 0 && <option value="">尚未有專案</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="auth-chip">
              <span className="muted-label">{user?.display_name} · {roleLabel(Boolean(user?.is_admin), role)}</span>
              <button className="btn no-print" type="button" onClick={() => setShowPassword(true)}>修改密碼</button>
              <button className="btn-blue" type="button" onClick={() => void signOut()}>登出</button>
            </div>
          </div>
        </div>
      </header>
      <main className="page">
        <ReminderBanner />
        {currentView === "projects" && <ProjectsPage />}
        {currentView === "people" && <PeoplePage />}
        {currentView === "tasks" && <TasksPage />}
        {currentView === "gantt" && (
          <Suspense fallback={<p className="hint">載入甘特圖…</p>}>
            <GanttPage />
          </Suspense>
        )}
        {currentView === "report" && <ReportPage />}
      </main>
      <footer className="site-footer">版權所有 Albert 工作基地 · V1</footer>
      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="app">
        <p className="hint" style={{ padding: 40 }}>載入中…</p>
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
