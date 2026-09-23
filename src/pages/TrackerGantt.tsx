import { useEffect, useRef } from "react";
import "../vendor/frappe-gantt.css";
import { formatISODate, todayISO } from "../lib/dates";
import { Gantt } from "../lib/ganttCtor";
import { rowSchedule, waveClass } from "../lib/trackerDates";
import { campaignDeadline, type TrackerCampaign, type TrackerRow } from "../lib/trackerTypes";

type GanttChart = InstanceType<typeof Gantt> & { dates?: Date[] };

function slashDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${Number(m)}/${Number(d)}` : iso;
}

function labelDays(root: HTMLElement, gantt: GanttChart) {
  const today = todayISO();
  const labels = root.querySelectorAll(".lower-text");
  (gantt.dates ?? []).forEach((date, index) => {
    const label = labels[index];
    if (!label) return;
    const iso = formatISODate(date);
    label.textContent = slashDate(iso);
    label.classList.toggle("current-day", iso === today);
  });
}

export function TrackerGantt({
  campaign,
  rows,
  onDates,
}: {
  campaign: TrackerCampaign;
  rows: TrackerRow[];
  onDates: (id: string, start: string, end: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onDatesRef = useRef(onDates);
  onDatesRef.current = onDates;
  const deadline = campaignDeadline(campaign);
  const today = todayISO();
  const bars = rows
    .map((row) => {
      const span = rowSchedule(row, campaign.waves);
      if (!span) return null;
      return {
        id: row.id,
        name: `${row.wave ? `${row.wave} · ` : ""}${row.product}`,
        start: span.start,
        end: span.end,
        progress: 100,
        custom_class: `${waveClass(row.wave)} ${row.affected.toLowerCase() || "tbd"}`,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const stamp = `${deadline}|${bars.map((bar) => `${bar.id}:${bar.start}:${bar.end}:${bar.custom_class}`).join("|")}`;

  useEffect(() => {
    if (!host.current) return;
    host.current.innerHTML = "";
    if (bars.length === 0) return;
    const tasks = [
      ...bars,
      {
        id: "campaign-deadline",
        name: `Deadline ${slashDate(deadline)}`,
        start: deadline,
        end: deadline,
        progress: 100,
        custom_class: "deadline",
      },
    ];
    const chart = new Gantt(host.current, tasks, {
      view_mode: "Day",
      column_width: 28,
      on_date_change: (task: { id: string }, start: Date, end: Date) => {
        if (task.id === "campaign-deadline") return;
        onDatesRef.current(task.id, formatISODate(start), formatISODate(end));
      },
    }) as GanttChart;
    labelDays(host.current, chart);
  }, [stamp, bars, deadline]);

  return (
    <div className="gantt-box">
      <div className="ww-badge" aria-label={`Deadline ${slashDate(deadline)}`} style={{ marginBottom: 12 }}>
        <span className="ww-kicker">今天</span>
        <strong>{slashDate(today)}</strong>
        <span className="muted-label">全案 Deadline {slashDate(deadline)}。軸用日期，不再顯示週數。</span>
      </div>
      {bars.length === 0 ? (
        <p className="hint">這些列還沒有測試期或 Wave 日期，先到 Wave 或總表補上。</p>
      ) : (
        <div ref={host} />
      )}
    </div>
  );
}
