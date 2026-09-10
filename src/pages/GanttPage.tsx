import { useEffect, useRef } from "react";
import "../vendor/frappe-gantt.css";
import { api } from "../lib/api";
import { formatISODate, formatWW, isoWeekParts } from "../lib/dates";
import { Gantt } from "../lib/ganttCtor";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";

type GanttChart = InstanceType<typeof Gantt> & { dates?: Date[] };

function labelWeeks(root: HTMLElement, gantt: GanttChart) {
  const currentWW = formatWW();
  const labels = root.querySelectorAll(".lower-text");
  (gantt.dates ?? []).forEach((date, index) => {
    const label = labels[index];
    if (!label) return;
    const ww = formatWW(formatISODate(date));
    label.textContent = ww;
    label.classList.toggle("current-ww", ww === currentWW);
  });
}

export function GanttPage() {
  const { tasks, reload, role } = useStore();
  const { user } = useAuth();
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<GanttChart | null>(null);
  const now = isoWeekParts();
  const nowWW = formatWW();

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
      view_mode: "Week",
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
    labelWeeks(host.current, chart.current);
  }, [tasks, role, user, reload]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>甘特圖</h1>
          <p>以週為單位顯示。拖曳橫條改日期。專案領導可改全部；成員只能改自己的任務。</p>
        </div>
        <div className="ww-badge" aria-label={`現在是 ${nowWW}`}>
          <span className="ww-kicker">現在是</span>
          <strong>{nowWW}</strong>
          <span className="muted-label">{now.year} 年第 {now.week} 週</span>
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
