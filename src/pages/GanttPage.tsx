import { useEffect, useRef } from "react";
import "../vendor/frappe-gantt.css";
import { api } from "../lib/api";
import { formatISODate } from "../lib/dates";
import { Gantt } from "../lib/ganttCtor";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";

export function GanttPage() {
  const { tasks, reload, role } = useStore();
  const { user } = useAuth();
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<InstanceType<typeof Gantt> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    host.current.innerHTML = "";
    const rows = tasks.map((task) => ({
      id: task.id,
      name: task.title,
      start: task.start_date,
      end: task.due_date,
      progress: task.status === "done" ? 100 : task.status === "doing" ? 50 : 0,
      custom_class: task.status,
    }));
    if (rows.length === 0) return;
    chart.current = new Gantt(host.current, rows, {
      view_mode: "Day",
      on_date_change: (task: { id: string }, start: Date, end: Date) => {
        const current = tasks.find((t) => t.id === task.id);
        const canEdit = role === "leader" || current?.assignee_id === user?.id;
        if (!canEdit) {
          void reload();
          return;
        }
        void api
          .updateTask(task.id, {
            start_date: formatISODate(start),
            due_date: formatISODate(end),
          })
          .then(reload);
      },
    });
  }, [tasks, role, user, reload]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>甘特圖</h1>
          <p>拖曳橫條改日期。專案領導可改全部；成員只能改自己的任務。</p>
        </div>
      </div>
      {tasks.length === 0 ? (
        <p className="hint">這個專案還沒有任務。</p>
      ) : (
        <div className="gantt-box">
          <div ref={host} />
        </div>
      )}
    </section>
  );
}
