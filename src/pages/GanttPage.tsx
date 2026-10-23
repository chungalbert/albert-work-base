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
  gantt_start?: Date;
  gantt_end?: Date;
  options?: { column_width?: number };
  setup_gantt_dates?: () => void;
  change_view_mode: (mode?: string) => void;
};

/** Weeks of padding around the selected week so empty weeks still have columns to scroll to. */
const SELECTED_NEIGHBOR_WEEKS = 8;
/** Extra months around tasks so the axis still feels full (frappe’s usual padding). */
const TASK_PAD_DAYS = 30;

const AXIS_ANCHOR_ID = "__axis_anchor__";

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

/**
 * Axis = union of (task span ± pad) and (selected week ± neighbors).
 * Always includes the navigated week so ‹ › moves the chart even with no tasks there.
 */
function axisBounds(
  weekStart: string,
  tasks: Array<{ start_date: string; due_date: string }>,
): { start: string; end: string } {
  let start = addDaysISO(weekStart, -SELECTED_NEIGHBOR_WEEKS * 7);
  let end = addDaysISO(weekStart, (SELECTED_NEIGHBOR_WEEKS + 1) * 7);

  for (const task of tasks) {
    const taskStart = addDaysISO(task.start_date, -TASK_PAD_DAYS);
    const taskEnd = addDaysISO(task.due_date, TASK_PAD_DAYS + 1);
    if (taskStart < start) start = taskStart;
    if (taskEnd > end) end = taskEnd;
  }

  return {
    start: startOfWeekMonday(start),
    end: startOfWeekMonday(end) === end ? end : addDaysISO(startOfWeekMonday(end), 7),
  };
}

/** Force frappe timeline to the union axis (headers + bar origin stay in sync). */
function applyAxisBounds(gantt: GanttChart, startIso: string, endIso: string) {
  const start = parseISODate(startIso);
  const end = parseISODate(endIso);
  gantt.setup_gantt_dates = function setup_gantt_dates(this: GanttChart) {
    this.gantt_start = new Date(start.getTime());
    this.gantt_end = new Date(end.getTime());
  };
  gantt.change_view_mode("Week");
}

/** Scroll so the selected week column is centered in the viewport. */
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

  // Rebuild when tasks or selected week change so the axis always covers the navigated week.
  useEffect(() => {
    if (!host.current) return;
    host.current.innerHTML = "";
    chart.current = null;

    const bounds = axisBounds(weekStart, tasks);
    const rows: Array<{
      id: string;
      name: string;
      start: string;
      end: string;
      progress: number;
      custom_class: string;
    }> = tasks.map((task) => ({
      id: task.id,
      name: isAll ? `${projectName(task.project_id)} · ${task.title}` : task.title,
      start: task.start_date,
      end: task.due_date,
      progress: 100,
      custom_class: task.status,
    }));

    // frappe-gantt needs ≥1 task to init; invisible anchor keeps empty-week navigation working.
    if (rows.length === 0) {
      rows.push({
        id: AXIS_ANCHOR_ID,
        name: "\u00a0",
        start: bounds.start,
        end: addDaysISO(bounds.start, 6),
        progress: 0,
        custom_class: "axis-anchor",
      });
    }

    const next = new Gantt(host.current, rows, {
      view_mode: "Week",
      on_date_change: (task: { id: string }, start: Date, end: Date) => {
        if (task.id === AXIS_ANCHOR_ID) return;
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
          .then(() => reload());
      },
    }) as GanttChart;

    applyAxisBounds(next, bounds.start, bounds.end);
    labelWeeks(host.current, next, selectedWW);
    scrollToWeek(host.current, next, weekStart);
    chart.current = next;
  }, [tasks, user, reload, isAll, projectName, canLeadProject, weekStart, selectedWW]);

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
      <div className="gantt-box">
        {tasks.length === 0 && (
          <p className="hint" style={{ marginBottom: 8 }}>
            {isAll ? "還沒有任務；仍可用 ‹ › 移動週次軸。" : "這個專案還沒有任務；仍可用 ‹ › 移動週次軸。"}
          </p>
        )}
        <div ref={host} />
        <ul className="gantt-legend" aria-label="狀態顏色">
          <li><span className="gantt-swatch opening" /> Open</li>
          <li><span className="gantt-swatch working" /> Working</li>
          <li><span className="gantt-swatch closing" /> Closing</li>
          <li><span className="gantt-swatch verify" /> Verify</li>
        </ul>
      </div>
    </section>
  );
}
