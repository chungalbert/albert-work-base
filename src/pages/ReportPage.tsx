import { addDaysISO, endOfWeekSunday, inRange, startOfWeekMonday, todayISO } from "../lib/dates";
import { downloadText } from "../lib/util";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { isTaskOpen, taskStatusLabel, type Task } from "../lib/types";

type Tone = "done" | "doing" | "overdue" | "next";

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

  const done = scoped.filter((t) => !isTaskOpen(t.status) && inRange(t.due_date, weekStart, weekEnd));
  const doing = scoped.filter((t) => isTaskOpen(t.status) && t.due_date >= today);
  const overdue = scoped.filter((t) => isTaskOpen(t.status) && t.due_date < today);
  const next = scoped.filter((t) => isTaskOpen(t.status) && inRange(t.due_date, nextStart, nextEnd));

  const download = async () => {
    const html = document.getElementById("weekly-report")?.outerHTML ?? "";
    const css: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        css.push([...sheet.cssRules].map((rule) => rule.cssText).join("\n"));
      } catch {
        if (!sheet.href) continue;
        try {
          css.push(await (await fetch(sheet.href)).text());
        } catch {
          /* downloaded file can still show the report structure */
        }
      }
    }
    downloadText(
      `weekly-report-${weekStart}.html`,
      `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>週報</title><style>${css.join("\n")}</style></head><body style="background:#0b1220;color:#f4f7fb;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;padding:24px">${html}</body></html>`,
      "text/html;charset=utf-8",
    );
  };

  const Section = ({ title, items, tone }: { title: string; items: Task[]; tone: Tone }) => (
    <section className={`report-block report-${tone}`}>
      <h2>
        {title}
        <span className="report-count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="report-empty">沒有這類任務</p>
      ) : (
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>任務</th>
                <th>負責人</th>
                <th>Deadline</th>
                <th>狀態</th>
                <th>已分析內容</th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => (
                <tr key={task.id}>
                  <td className="report-task">{task.title}</td>
                  <td>{nameOf(task.assignee_id)}</td>
                  <td className="report-date">{task.due_date}</td>
                  <td>
                    <span className={`status-pill status-${task.status}`}>{taskStatusLabel(task.status)}</span>
                  </td>
                  <td className="report-analysis">{task.analyzed || task.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
          <button className="btn btn-gold" type="button" onClick={() => void download()}>下載 HTML</button>
        </div>
      </div>
      <article className="report" id="weekly-report">
        <header className="report-head">
          <p className="report-kicker">Weekly Report</p>
          <h1>{project?.name ?? "專案"}</h1>
          <dl className="report-meta">
            <div>
              <dt>期間</dt>
              <dd>{weekStart} — {weekEnd}</dd>
            </div>
            <div>
              <dt>產出</dt>
              <dd>{today}</dd>
            </div>
            <div>
              <dt>範圍</dt>
              <dd>{role === "leader" ? "專案全員" : "我的任務"}</dd>
            </div>
            <div>
              <dt>撰寫</dt>
              <dd>{user?.display_name ?? "—"}</dd>
            </div>
          </dl>
        </header>
        <Section title="本週完成" items={done} tone="done" />
        <Section title="進行中" items={doing} tone="doing" />
        <Section title="逾期" items={overdue} tone="overdue" />
        <Section title="下週到期" items={next} tone="next" />
      </article>
    </section>
  );
}
