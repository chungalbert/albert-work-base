import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../context/StoreContext";

export function ProjectsPage() {
  const { projects, setProjectId, projectId, reload, role } = useStore();
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
          <p>同一人可以在不同專案當領導或成員。</p>
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
          {role && <p className="hint" style={{ marginTop: 12 }}>目前身份：{role === "leader" ? "專案領導 / 管理員" : "專案成員"}</p>}
        </form>
      </div>
    </section>
  );
}
