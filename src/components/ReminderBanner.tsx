import { taskReminders } from "../lib/reminders";
import { useStore } from "../context/StoreContext";

export function ReminderBanner() {
  const { tasks, profiles, isAll, projectName } = useStore();
  const items = taskReminders(tasks);
  if (items.length === 0) return null;
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? "未指派";
  const label = { overdue: "已逾期", today: "今日到期", tomorrow: "明日到期" };
  return (
    <div className="alerts">
      <h2>今日提醒</h2>
      <ul>
        {items.map((item) => (
          <li key={item.task.id}>
            {label[item.kind]}
            {isAll ? ` · ${projectName(item.task.project_id)}` : ""}
            {" · "}{item.task.title} · {nameOf(item.task.assignee_id)} · {item.task.due_date}
          </li>
        ))}
      </ul>
    </div>
  );
}
