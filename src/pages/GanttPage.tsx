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
  options?: { view_mode?: string; column_width?: number };
  $svg?: SVGElement;
  setup_gantt_dates?: () => void;
  change_view_mode: (mode?: string) => void;
};

const PAD_WEEKS = 3;

function weekWindow(weekStart: string, padWeeks = PAD_WEEKS) {
  const start = addDaysISO(weekStart, -padWeeks * 7);
  // Exclusive end so Week columns cover selected±pad.
  const end = addDaysISO(weekStart, (padWeeks + 1) * 7);
  return { start, end };
}

/** Task overlaps [winStart, winEnd). */
function overlapsWindow(start: string, end: string, winStart: string, winEnd: string) {
  return end >= winStart && start < winEnd;
}

/**
 * Clamp bar span to the visible window so x/width stay under the WW headers.
 * Drag still persists the (possibly clamped) dates — same as editing within the view.
 */
function clampToWindow(start: string, end: string, winStart: string, winEnd: string) {
  const lastDay = addDaysISO(winEnd, -1);
  const clampedStart = start < winStart ? winStart : start;
  const clampedEnd = end > lastDay ? lastDay : end;
  return {
    start: clampedStart,
    end: clampedEnd < clampedStart ? clampedStart : clampedEnd,
  };
}

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
 * Lock frappe-gantt's timeline to the week window so grid columns and bars share one origin.
 * Override setup_gantt_dates (skips ±1 month task padding) then change_view_mode.
 */
function applyWeekWindow(gantt: GanttChart, weekStart: string, padWeeks = PAD_WEEKS) {
  const { start, end } = weekWindow(weekStart, padWeeks);
  const winStart = parseISODate(start);
  const winEnd = parseISODate(end);

  gantt.setup_gantt_dates = function setup_gantt_dates(this: GanttChart) {
    this.gantt_start = new Date(winStart.getTime());
    this.gantt_end = new Date(winEnd.getTime());
  };
  gantt.change_view_mode("Week");

  const cols = gantt.dates?.length ?? 0;
  const columnWidth = gantt.options?.column_width ?? 140;
  if (gantt.$svg && cols > 0) {
    gantt.$svg.setAttribute("width", String(cols * columnWidth));
    gantt.$svg.style.overflow = "hidden";
  }
}

function scrollToWeek(root: HTMLElement, gantt: GanttChart, weekStart: string) {
  const parent = (root.querySelector(".gantt-container") as HTMLElement | null) ?? root;
  if (!gantt.dates?.length) return;
  const target = parseISODate(weekStart).getTime();
  let index = gantt.dates.findIndex((date) => formatISODate(date) === weekStart);
  if (index < 0) {
    index = gantt.dates.findIndex((date) => Math.abs(date.getTime() - target) < 86400000);
  }
  if (index < 0) return;
  const columnWidth = gantt.options?.column_width ?? 140;
  parent.scrollLeft = Math.max(0, index * columnWidth - columnWidth);
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
  const { start: winStart, end: winEnd } = weekWindow(weekStart);
  const visibleCount = tasks.reduce(
    (n, task) => n + (overlapsWindow(task.start_date, task.due_date, winStart, winEnd) ? 1 : 0),
    0,
  );

  useEffect(() => {
    if (!host.current) return;
    host.current.innerHTML = "";
    const { start: rangeStart, end: rangeEnd } = weekWindow(weekStart);
    const rows = tasks
      .filter((task) => overlapsWindow(task.start_date, task.due_date, rangeStart, rangeEnd))
      .map((task) => {
        const span = clampToWindow(task.start_date, task.due_date, rangeStart, rangeEnd);
        return {
          id: task.id,
          name: isAll ? `${projectName(task.project_id)} · ${task.title}` : task.title,
          start: span.start,
          end: span.end,
          progress: 100,
          custom_class: task.status,
        };
      });
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
    applyWeekWindow(next, weekStart);
    labelWeeks(host.current, next, selectedWW);
    scrollToWeek(host.current, next, weekStart);
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
      {tasks.length === 0 ? (
        <p className="hint">{isAll ? "還沒有任務。" : "這個專案還沒有任務。"}</p>
      ) : visibleCount === 0 ? (
        <p className="hint">這個週次視窗沒有任務。用 ‹ › 換週，或回到目前週。</p>
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
