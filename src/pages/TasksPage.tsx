import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { todayISO, addDaysISO } from "../lib/dates";
import type { TaskStatus } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

const STATUS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "未開始" },
  { id: "doing", label: "進行中" },
  { id: "done", label: "完成" },
];

export function TasksPage() {
  const { user } = useAuth();
  const { project, tasks, profiles, members, role, reload } = useStore();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(user?.id ?? "");
  const [start, setStart] = useState(todayISO());
  const [due, setDue] = useState(addDaysISO(todayISO(), 3));
  const [note, setNote] = useState("");
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
        status: "todo",
        note: note.trim(),
      });
      setTitle("");
      setNote("");
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
          <h1>任務</h1>
          <p>
            {canManage
              ? "可新增、指派與改 Deadline。專案成員登入後只會看到自己的任務。"
              : "這是指派給你的任務，可以改狀態與日期。"}
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
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>當前狀態</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：等零件、已送審、測試中"
              />
            </div>
          </div>
          <p className="error">{error}</p>
          <button className="btn btn-gold" type="submit" disabled={!project}>新增任務</button>
        </form>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>任務</th>
                <th>負責人</th>
                <th>開始</th>
                <th>Deadline</th>
                <th>進度</th>
                <th>當前狀態</th>
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
                        {STATUS.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="note-input"
                        defaultValue={task.note ?? ""}
                        key={`${task.id}-note-${task.note ?? ""}`}
                        disabled={!canEdit}
                        placeholder="輸入當前狀態"
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== (task.note ?? "")) void patch(task.id, { note: value });
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
