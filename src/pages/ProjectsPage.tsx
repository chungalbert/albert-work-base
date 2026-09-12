import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { roleLabel } from "../lib/roles";
import { taskStatusLabel } from "../lib/types";

export function ProjectsPage() {
  const { user } = useAuth();
  const { projects, setProjectId, projectId, reload, role, allTasks, profiles, leaderProjectIds } = useStore();
  const canCreate = Boolean(user?.is_admin || role === "leader");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const project = await api.createProject(name, description);
      setName("");
      setDescription("");
      setProjectId(project.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    }
  };

  const onDelete = async (id: string, projectName: string) => {
    const ok = window.confirm(`確定刪除「${projectName}」？這個專案的任務與成員關係會一併刪除，無法復原。`);
    if (!ok) return;
    setError("");
    setBusyId(id);
    try {
      await api.deleteProject(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setBusyId("");
    }
  };

  const nameOf = (id: string | null) => profiles.find((profile) => profile.id === id)?.display_name ?? "未指派";

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>專案</h1>
          <p>任務屬於專案。A 專案只會看到 A 的任務，切換到 B 專案才會看到 B 的任務。專案領導可刪除自己的專案。</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="project-stack">
        {projects.length === 0 && <p className="hint">還沒有專案，先新增一個。</p>}
        {projects.map((project) => {
          const nested = allTasks.filter((task) => task.project_id === project.id);
          const current = project.id === projectId;
          return (
            <article key={project.id} className={current ? "panel project-block current" : "panel project-block"}>
              <div className="project-block-head">
                <div>
                  <h2>{project.name}</h2>
                  {project.description && <p className="hint">{project.description}</p>}
                </div>
                <div className="row">
                  {current ? (
                    <span className="ok-pill">目前專案</span>
                  ) : (
                    <button className="btn" type="button" onClick={() => setProjectId(project.id)}>
                      切換到此專案
                    </button>
                  )}
                  {leaderProjectIds.includes(project.id) && (
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={busyId === project.id}
                      onClick={() => void onDelete(project.id, project.name)}
                    >
                      {busyId === project.id ? "刪除中…" : "刪除專案"}
                    </button>
                  )}
                </div>
              </div>
              {nested.length === 0 ? (
                <p className="hint" style={{ marginTop: 12 }}>這個專案還沒有任務。</p>
              ) : (
                <ul className="project-task-list">
                  {nested.map((task) => (
                    <li key={task.id}>
                      {task.title}
                      <span className="hint"> · {nameOf(task.assignee_id)} · {task.start_date} → {task.due_date} · {taskStatusLabel(task.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}

        {canCreate ? (
          <form className="panel" onSubmit={onCreate}>
            <h2 style={{ marginTop: 0 }}>新增專案</h2>
            <div className="field">
              <label htmlFor="proj-name">名稱</label>
              <input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="proj-desc">說明</label>
              <textarea id="proj-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <button className="btn btn-gold" type="submit">建立（你會成為專案領導）</button>
            <p className="hint" style={{ marginTop: 12 }}>目前身份：{roleLabel(Boolean(user?.is_admin), role)}</p>
          </form>
        ) : (
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>你的權限</h2>
            <p className="hint">目前是專案成員，可看任務、甘特圖與自己的週報。人員與專案設定由領導處理。</p>
          </div>
        )}
      </div>
    </section>
  );
}
