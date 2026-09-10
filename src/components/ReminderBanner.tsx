import { taskReminders } from "../lib/reminders";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

export function ReminderBanner() {
  const { user } = useAuth();
  const { tasks, profiles, role } = useStore();
  const mine = role === "leader" ? tasks : tasks.filter((t) => t.assignee_id === user?.id);
  const items = taskReminders(mine);
  if (items.length === 0) return null;
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? "未指派";
  const label = { overdue: "已逾期", today: "今日到期", tomorrow: "明日到期" };
  return (
    <div className="alerts">
          <h2>今日提醒</h2>
      <ul>
        {items.map((item) => (
          <li key={item.task.id}>
            {label[item.kind]} · {item.task.title} · {nameOf(item.task.assignee_id)} · {item.task.due_date}
          </li>
        ))}
      </ul>
    </div>
  );
}
