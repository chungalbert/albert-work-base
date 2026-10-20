import { useEffect, useRef, useState } from "react";
import "../vendor/frappe-gantt.css";
import { api } from "../lib/api";
import {
  addDaysISO,
  formatISODate,
  formatWW,
  isoWeekParts,
  parseISODate,
  startOfWeekMonday,
} from "../lib/dates";
import { Gantt } from "../lib/ganttCtor";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";

type GanttChart = InstanceType<typeof Gantt> & {
  dates?: Date[];
  options?: { column_width?: number };
};

/** Label each Week column as WW##; highlight the selected week. */
function labelWeeks(root: HTMLElement, gantt: GanttChart, selectedWW: string) {
  const labels = root.querySelectorAll(".lower-text");
  (gantt.dates ?? []).forEach((date, index) => {
    const label = labels[index];
    if (!label) return;
    const ww = formatWW(formatISODate(date));
    label.textContent = ww;
    label.classList.toggle("current-ww", ww === selectedWW);
  });
}

/** Scroll so the selected week column is near the left/center of the viewport. */
function scrollToWeek(root: HTMLElement, gantt: GanttChart, weekStart: string) {
  const parent = (root.querySelector(".gantt-container") as HTMLElement | null) ?? root;
  const dates = gantt.dates ?? [];
  if (!dates.length) return;

  const target = parseISODate(weekStart).getTime();
  let index = dates.findIndex((date) => formatISODate(date) === weekStart);
  if (index < 0) {
    index = dates.findIndex((date) => Math.abs(date.getTime() - target) < 86400000);
  }
  if (index < 0) {
    // Selected week outside task-driven axis — scroll to nearest column.
    let best = 0;
    let bestDist = Infinity;
    dates.forEach((date, i) => {
      const dist = Math.abs(date.getTime() - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    index = best;
  }

  const columnWidth = gantt.options?.column_width ?? 140;
  const view = parent.clientWidth || columnWidth * 3;
  parent.scrollLeft = Math.max(0, index * columnWidth - Math.max(0, (view - columnWidth) / 2));
}

export function GanttPage() {
  const { tasks, reload, project, isAll, projectName, canLeadProject } = useStore();
  const { user } = useAuth();
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<GanttChart | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday());
  const selected = isoWeekParts(weekStart);
  const selectedWW = formatWW(weekStart);
  const isCurrentWeek = weekStart === startOfWeekMonday();

  // Full task-driven timeline (frappe ±1 month padding). No week-window filter/clamp.
  useEffect(() => {
    if (!host.current) return;
    host.current.innerHTML = "";
    chart.current = null;
    const rows = tasks.map((task) => ({
      id: task.id,
      name: isAll ? `${projectName(task.project_id)} · ${task.title}` : task.title,
      start: task.start_date,
      end: task.due_date,
      progress: 100,
      custom_class: task.status,
    }));
    if (rows.length === 0) return;
    const next = new Gantt(host.current, rows, {
      view_mode: "Week",
      on_date_change: (task: { id: string }, start: Date, end: Date) => {
        const current = tasks.find((t) => t.id === task.id);
        const canEdit = Boolean(current && (canLeadProject(current.project_id) || current.assignee_id === user?.id));
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
    }) as GanttChart;
    chart.current = next;
    labelWeeks(host.current, next, formatWW(weekStart));
    scrollToWeek(host.current, next, weekStart);
  }, [tasks, user, reload, isAll, projectName, canLeadProject]);

  // Week nav: highlight + scroll only — do not rebuild or shrink the axis.
  useEffect(() => {
    if (!host.current || !chart.current) return;
    labelWeeks(host.current, chart.current, selectedWW);
    scrollToWeek(host.current, chart.current, weekStart);
  }, [weekStart, selectedWW]);

  return (
    <section className="schedule-page">
      <div className="page-head page-head-compact">
        <div>
          <h1>{isAll ? "全部專案甘特圖" : project ? `${project.name} 甘特圖` : "甘特圖"}</h1>
          <p>
            {isAll
              ? "一次顯示所有專案的任務。橫條名稱前面是專案。拖曳可改日期。"
              : "以週為單位顯示目前專案的任務。拖曳橫條改日期。專案領導可改全部；成員只能改自己的任務。"}
          </p>
        </div>
        <div
          className="ww-badge ww-badge-nav"
          role="group"
          aria-label={`${selected.year} 年第 ${selected.week} 週`}
        >
          <button
            type="button"
            className="ww-nav-btn"
            aria-label="上一週"
            title="上一週"
            onClick={() => setWeekStart((prev) => addDaysISO(prev, -7))}
          >
            ‹
          </button>
          <div className="ww-badge-core">
            <span className="ww-kicker">{isCurrentWeek ? "現在是" : "週次"}</span>
            <strong>{selectedWW}</strong>
            <span className="muted-label">{selected.year} 年第 {selected.week} 週</span>
          </div>
          <button
            type="button"
            className="ww-nav-btn"
            aria-label="下一週"
            title="下一週"
            onClick={() => setWeekStart((prev) => addDaysISO(prev, 7))}
          >
            ›
          </button>
        </div>
      </div>
      {tasks.length === 0 ? (
        <p className="hint">{isAll ? "還沒有任務。" : "這個專案還沒有任務。"}</p>
      ) : (
        <div className="gantt-box">
          <div ref={host} />
          <ul className="gantt-legend" aria-label="狀態顏色">
            <li><span className="gantt-swatch opening" /> Opening</li>
            <li><span className="gantt-swatch working" /> Working</li>
            <li><span className="gantt-swatch closing" /> Closing</li>
            <li><span className="gantt-swatch verify" /> Verify</li>
          </ul>
        </div>
      )}
    </section>
  );
}
