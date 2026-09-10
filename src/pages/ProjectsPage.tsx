import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { roleLabel } from "../lib/roles";

export function ProjectsPage() {
  const { user } = useAuth();
  const { projects, setProjectId, projectId, reload, role } = useStore();
  const canCreate = Boolean(user?.is_admin || role === "leader");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

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

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>專案</h1>
          <p>同一個帳號可以在不同專案當領導或成員。登入後看到的功能依角色而定。</p>
        </div>
      </div>
      <div className="grid-2">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>現有專案</h2>
          {projects.length === 0 && <p className="hint">還沒有專案，先在右側新增一個。</p>}
          <ul>
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  className={project.id === projectId ? "btn btn-gold" : "btn"}
                  onClick={() => setProjectId(project.id)}
                >
                  {project.name}
                </button>
                <span className="hint" style={{ marginLeft: 8 }}>{project.description}</span>
              </li>
            ))}
          </ul>
        </div>
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
          <p className="error">{error}</p>
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
