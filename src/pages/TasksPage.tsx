import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { todayISO, addDaysISO } from "../lib/dates";
import { TASK_STATUSES, type TaskStatus } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

export function TasksPage() {
  const { user } = useAuth();
  const { project, tasks, profiles, members, role, reload } = useStore();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(user?.id ?? "");
  const [start, setStart] = useState(todayISO());
  const [due, setDue] = useState(addDaysISO(todayISO(), 3));
  const [status, setStatus] = useState<TaskStatus>("opening");
  const [analyzed, setAnalyzed] = useState("");
  const [error, setError] = useState("");

  const people = members
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const canManage = role === "leader";

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;
    setError("");
    try {
      await api.createTask({
        project_id: project.id,
        title: title.trim(),
        assignee_id: assignee || null,
        start_date: start,
        due_date: due < start ? start : due,
        status,
        note: "",
        analyzed: analyzed.trim(),
      });
      setTitle("");
      setAnalyzed("");
      setStatus("opening");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    }
  };

  const patch = async (id: string, next: Parameters<typeof api.updateTask>[1]) => {
    await api.updateTask(id, next);
    await reload();
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{project ? `${project.name} 的任務` : "任務"}</h1>
          <p>
            {!project
              ? "請先在右上角或專案頁選一個專案。新增的任務只會進目前專案。"
              : canManage
              ? `只顯示「${project.name}」的任務。切換右上角專案可看其他專案。`
              : `這是「${project.name}」裡指派給你的任務。`}
          </p>
        </div>
      </div>

      {canManage && (
        <form className="panel" onSubmit={create} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field">
              <label>任務名稱</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label>負責人</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">未指派</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>開始</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div className="field">
              <label>Deadline</label>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
            </div>
            <div className="field">
              <label>當前狀態</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {TASK_STATUSES.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="task-analyzed">已分析內容</label>
              <textarea
                id="task-analyzed"
                className="analysis-input"
                rows={4}
                value={analyzed}
                onChange={(e) => setAnalyzed(e.target.value)}
                placeholder="紀錄已分析的內容"
              />
            </div>
          </div>
          <p className="error">{error}</p>
          <button className="btn btn-gold" type="submit" disabled={!project}>
            {project ? `新增到「${project.name}」` : "請先選專案"}
          </button>
        </form>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>任務</th>
                <th>負責人</th>
                <th>開始</th>
                <th>Deadline</th>
                <th>當前狀態</th>
                <th>已分析內容</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(canManage ? tasks : tasks.filter((t) => t.assignee_id === user?.id)).map((task) => {
                const owner = profiles.find((p) => p.id === task.assignee_id);
                const canEdit = canManage || task.assignee_id === user?.id;
                return (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{owner?.display_name ?? "—"}</td>
                    <td>
                      <input
                        type="date"
                        value={task.start_date}
                        disabled={!canEdit}
                        onChange={(e) => void patch(task.id, { start_date: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={task.due_date}
                        disabled={!canEdit}
                        onChange={(e) => void patch(task.id, { due_date: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={task.status}
                        disabled={!canEdit}
                        onChange={(e) => void patch(task.id, { status: e.target.value as TaskStatus })}
                      >
                        {TASK_STATUSES.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <textarea
                        className="analysis-input"
                        rows={3}
                        defaultValue={task.analyzed ?? ""}
                        key={`${task.id}-analyzed-${task.analyzed ?? ""}`}
                        disabled={!canEdit}
                        placeholder="紀錄已分析的內容"
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== (task.analyzed ?? "")) void patch(task.id, { analyzed: value });
                        }}
                      />
                    </td>
                    {canManage && (
                      <td>
                        <button className="btn" type="button" onClick={() => void api.deleteTask(task.id).then(reload)}>
                          刪除
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
