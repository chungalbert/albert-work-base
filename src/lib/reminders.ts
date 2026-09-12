import { addDaysISO, inRange, todayISO } from "./dates";
import type { LeaderDigest, Project, ReminderItem, Task } from "./types";
import { isTaskOpen } from "./types";

export function taskReminders(tasks: Task[]): ReminderItem[] {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const items: ReminderItem[] = [];
  for (const task of tasks) {
    if (!isTaskOpen(task.status)) continue;
    if (task.due_date < today) items.push({ kind: "overdue", task });
    else if (task.due_date === today) items.push({ kind: "today", task });
    else if (task.due_date === tomorrow) items.push({ kind: "tomorrow", task });
  }
  return items;
}

export function leaderDigests(
  tasks: Task[],
  projects: Project[],
  weekStart: string,
  weekEnd: string,
): LeaderDigest[] {
  const today = todayISO();
  return projects.map((project) => {
    const list = tasks.filter((t) => t.project_id === project.id && isTaskOpen(t.status));
    return {
      project_name: project.name,
      overdue: list.filter((t) => t.due_date < today),
      today: list.filter((t) => t.due_date === today),
      week: list.filter((t) => inRange(t.due_date, weekStart, weekEnd)),
    };
  });
}
