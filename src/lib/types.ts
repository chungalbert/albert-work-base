export type Role = "leader" | "member";
export const TASK_STATUSES = [
  { id: "opening", label: "Opening" },
  { id: "working", label: "Working" },
  { id: "closing", label: "Closing" },
  { id: "verify", label: "Verify" },
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number]["id"];
export type ViewId = "projects" | "people" | "tasks" | "gantt" | "report";

export function taskStatusLabel(status: string): string {
  return TASK_STATUSES.find((item) => item.id === status)?.label ?? status;
}

export function normalizeTaskStatus(status: string): TaskStatus {
  if (status === "todo" || status === "opening") return "opening";
  if (status === "doing" || status === "working") return "working";
  if (status === "closing") return "closing";
  if (status === "done" || status === "verify") return "verify";
  return "opening";
}

export function isTaskOpen(status: string): boolean {
  return normalizeTaskStatus(status) !== "verify";
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  unit: string;
  email: string;
  is_admin: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: Role;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  assignee_id: string | null;
  start_date: string;
  due_date: string;
  status: TaskStatus;
  note: string;
  analyzed: string;
}

export interface AccountInput {
  display_name: string;
  unit: string;
  email: string;
}

export interface InviteInput extends AccountInput {
  role: Role;
  project_id: string;
}

export interface CredentialRow {
  display_name: string;
  username: string;
  email: string;
  password: string;
  project_name?: string;
  role?: Role;
}

export interface ReminderItem {
  kind: "overdue" | "today" | "tomorrow";
  task: Task;
}

export interface LeaderDigest {
  project_name: string;
  overdue: Task[];
  today: Task[];
  week: Task[];
}
