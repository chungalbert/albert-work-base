import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { isTaskOpen, taskStatusLabel, type Task } from "../lib/types";
import { todayISO, parseISODate, formatISODate } from "../lib/dates";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isAlertTask(task: Task): boolean {
  if (!isTaskOpen(task.status)) return false;
  const today = todayISO();
  return task.due_date < today || task.status === "working";
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function DashboardPage() {
  const { user } = useAuth();
  const { tasks, projectName, initialLoading, loadError } = useStore();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => parseISODate(today));
  const [selected, setSelected] = useState(today);

  const myTasks = useMemo(() => {
    if (!user) return [];
    return tasks.filter((t) => user.is_admin || t.assignee_id === user.id || isTaskOpen(t.status));
  }, [tasks, user]);

  const openItems = myTasks.filter((t) => isTaskOpen(t.status));
  const alertItems = myTasks.filter(isAlertTask);
  const closedItems = myTasks.filter((t) => !isTaskOpen(t.status));
  const closeRate =
    myTasks.length === 0 ? 0 : Math.round((closedItems.length / myTasks.length) * 100);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    setCursor(new Date(year, month + delta, 1));
  };

  const goToday = () => {
    const d = parseISODate(today);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(today);
  };

  const selectedDate = parseISODate(selected);
  const selectedLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="dash">
      <div className="dash-stats">
        <article className="dash-stat dash-stat-open">
          <div className="dash-stat-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 7h8M8 12h8M8 17h5" />
              <rect x="4" y="3" width="16" height="18" rx="2" />
            </svg>
          </div>
          <div>
            <p className="dash-stat-label">OPEN ITEMS</p>
            <p className="dash-stat-value">{openItems.length}</p>
          </div>
        </article>
        <article className="dash-stat dash-stat-alert">
          <div className="dash-stat-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
          </div>
          <div>
            <p className="dash-stat-label">OPEN / WORKING ALERT ISSUES</p>
            <p className="dash-stat-value">{alertItems.length}</p>
          </div>
        </article>
        <article className="dash-stat dash-stat-closed">
          <div className="dash-stat-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 12.5l2.5 2.5 4.5-5" />
            </svg>
          </div>
          <div className="dash-stat-closed-body">
            <div>
              <p className="dash-stat-label">CLOSED</p>
              <p className="dash-stat-value">{closedItems.length}</p>
            </div>
            <p className="dash-close-rate">
              CLOSE RATE {closeRate}% {closedItems.length}/{myTasks.length}
            </p>
          </div>
        </article>
      </div>

      <div className="dash-mid">
        <section className="dash-panel dash-issues">
          <header className="dash-panel-head">
            <h2><span className="bar bar-blue" /> MY ISSUE LIST</h2>
            <span className="dash-badge">{openItems.length}</span>
          </header>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>NUMBER</th>
                  <th>STATE</th>
                  <th>ISSUE NAME</th>
                  <th>PROJECT</th>
                </tr>
              </thead>
              <tbody>
                {openItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="dash-empty">
                      {initialLoading
                        ? "載入中…"
                        : loadError
                          ? "Failed to load issues."
                          : "No issues found."}
                    </td>
                  </tr>
                ) : (
                  openItems.slice(0, 12).map((task) => (
                    <tr key={task.id}>
                      <td className="mono">{shortId(task.id)}</td>
                      <td>
                        <span className={`status-pill status-${task.status}`}>
                          {taskStatusLabel(task.status)}
                        </span>
                      </td>
                      <td>{task.title}</td>
                      <td>{projectName(task.project_id)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dash-panel dash-alerts">
          <header className="dash-panel-head">
            <h2>
              <span className="alert-icon" aria-hidden="true">!</span>
              OPEN / WORKING ALERT ISSUES
            </h2>
          </header>
          {alertItems.length === 0 ? (
            <div className="dash-empty-box">
              {initialLoading
                ? "載入中…"
                : loadError
                  ? "Failed to load issues."
                  : "No open or working alert issues."}
            </div>
          ) : (
            <ul className="dash-alert-list">
              {alertItems.slice(0, 8).map((task) => (
                <li key={task.id}>
                  <span className={`status-pill status-${task.status}`}>
                    {taskStatusLabel(task.status)}
                  </span>
                  <div>
                    <strong>{task.title}</strong>
                    <p>{projectName(task.project_id)} · due {task.due_date}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="dash-panel dash-calendar">
        <header className="dash-cal-head">
          <div>
            <h2><span className="bar bar-green" /> CALENDAR</h2>
            <p className="dash-cal-sub">Monthly view of approved and pending leave personnel.</p>
          </div>
          <div className="dash-cal-controls">
            <select
              aria-label="Year"
              value={year}
              onChange={(e) => setCursor(new Date(Number(e.target.value), month, 1))}
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              aria-label="Month"
              value={month}
              onChange={(e) => setCursor(new Date(year, Number(e.target.value), 1))}
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i}>{name}</option>
              ))}
            </select>
            <select
              aria-label="Day"
              value={selectedDate.getMonth() === month && selectedDate.getFullYear() === year
                ? selectedDate.getDate()
                : 1}
              onChange={(e) => setSelected(formatISODate(new Date(year, month, Number(e.target.value))))}
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button type="button" className="dash-cal-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            <button type="button" className="dash-cal-nav" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
            <button type="button" className="dash-cal-today" onClick={goToday}>Today</button>
          </div>
        </header>

        <div className="dash-cal-body">
          <div className="dash-cal-grid" role="grid" aria-label={`${MONTHS[month]} ${year}`}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="dash-cal-dow">{d}</div>
            ))}
            {cells.map((day, idx) => {
              if (day == null) return <div key={`e-${idx}`} className="dash-cal-cell empty" />;
              const iso = formatISODate(new Date(year, month, day));
              const isSel = iso === selected;
              const isToday = iso === today;
              return (
                <button
                  key={iso}
                  type="button"
                  className={`dash-cal-cell${isSel ? " selected" : ""}${isToday ? " today" : ""}`}
                  onClick={() => setSelected(iso)}
                >
                  <span className="dash-cal-day">{day}</span>
                </button>
              );
            })}
          </div>
          <aside className="dash-cal-selected">
            <p className="dash-cal-selected-label">SELECTED DATE</p>
            <p className="dash-cal-selected-date">{selectedLabel}</p>
            <div className="dash-empty-box compact">No leave records for this date.</div>
            <p className="hint">Leave data is not wired yet — calendar shell only.</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
