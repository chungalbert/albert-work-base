import { addDaysISO, endOfWeekSunday, inRange, startOfWeekMonday, todayISO } from "../lib/dates";
import { downloadText } from "../lib/util";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import type { Task } from "../lib/types";

function labelStatus(status: Task["status"]) {
  if (status === "done") return "完成";
  if (status === "doing") return "進行中";
  return "未開始";
}

export function ReportPage() {
  const { user } = useAuth();
  const { project, tasks, profiles, role } = useStore();
  const weekStart = startOfWeekMonday();
  const weekEnd = endOfWeekSunday();
  const nextStart = addDaysISO(weekEnd, 1);
  const nextEnd = addDaysISO(nextStart, 6);
  const today = todayISO();

  const scoped = role === "leader" ? tasks : tasks.filter((t) => t.assignee_id === user?.id);
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? "未指派";

  const done = scoped.filter((t) => t.status === "done" && inRange(t.due_date, weekStart, weekEnd));
  const doing = scoped.filter((t) => t.status !== "done" && t.due_date >= today);
  const overdue = scoped.filter((t) => t.status !== "done" && t.due_date < today);
  const next = scoped.filter((t) => t.status !== "done" && inRange(t.due_date, nextStart, nextEnd));

  const download = () => {
    const html = document.getElementById("weekly-report")?.outerHTML ?? "";
    downloadText(
      `weekly-report-${weekStart}.html`,
      `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>週報</title></head><body>${html}</body></html>`,
      "text/html;charset=utf-8",
    );
  };

  const Section = ({ title, items }: { title: string; items: Task[] }) => (
    <>
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p>無</p>
      ) : (
        <ul>
          {items.map((t) => (
            <li key={t.id}>
              {t.title} · {nameOf(t.assignee_id)} · Deadline {t.due_date} · {labelStatus(t.status)}
              {t.note ? ` · ${t.note}` : ""}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <section>
      <div className="page-head no-print">
        <div>
          <h1>週報</h1>
          <p>
            {project ? `「${project.name}」` : "專案"} · 本週一到日（台北）· {role === "leader" ? "專案全員" : "我的任務"}
          </p>
        </div>
        <div className="row">
          <button className="btn" type="button" onClick={() => window.print()}>列印 / 存 PDF</button>
          <button className="btn btn-gold" type="button" onClick={download}>下載 HTML</button>
        </div>
      </div>
      <article className="report" id="weekly-report">
        <h1>{project?.name ?? "專案"} Weekly Report</h1>
        <p className="meta">
          {weekStart} — {weekEnd} · 產出時間 {today} · {user?.display_name}
        </p>
        <Section title="本週完成" items={done} />
        <Section title="進行中" items={doing} />
        <Section title="逾期" items={overdue} />
        <Section title="下週到期" items={next} />
      </article>
    </section>
  );
}
