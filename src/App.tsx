import { lazy, Suspense, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { StoreProvider, useStore } from "./context/StoreContext";
import { LoginPage } from "./pages/LoginPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { TasksPage } from "./pages/TasksPage";
import { ReportPage } from "./pages/ReportPage";
import { ReminderBanner } from "./components/ReminderBanner";
import { SetupBanner } from "./components/SetupBanner";
import type { ViewId } from "./lib/types";

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
  const { projects, projectId, setProjectId } = useStore();
  const [view, setView] = useState<ViewId>("projects");

  return (
    <div className="wrap">
      <header className="top">
        <a className="brand" href="./">
          <span className="mark" aria-hidden="true">A</span>
          <span className="brand-name">ALBERT</span>
        </a>
        <div className="top-actions">
          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="專案"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", padding: "8px 10px" }}
          >
            {projects.length === 0 && <option value="">尚未有專案</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="pill">{user?.display_name}</span>
          <button className="logout" type="button" onClick={() => void signOut()}>登出</button>
        </div>
      </header>
      <nav className="nav" aria-label="主選單">
        {NAV.map((item) => (
          <button key={item.id} className={view === item.id ? "on" : ""} type="button" onClick={() => setView(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      <SetupBanner />
      <ReminderBanner />
      {view === "projects" && <ProjectsPage />}
      {view === "people" && <PeoplePage />}
      {view === "tasks" && <TasksPage />}
      {view === "gantt" && (
        <Suspense fallback={<p className="hint">載入甘特圖…</p>}>
          <GanttPage />
        </Suspense>
      )}
      {view === "report" && <ReportPage />}
      <footer className="foot">Albert的工作基地</footer>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main className="gate">
        <p className="hint">載入中…</p>
      </main>
    );
  }
  if (!user) return <LoginPage />;
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
