export type Role = "leader" | "member";
export type TaskStatus = "todo" | "doing" | "done";
export type ViewId = "projects" | "people" | "tasks" | "gantt" | "report";

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
}

export interface InviteInput {
  display_name: string;
  unit: string;
  email: string;
  role: Role;
  project_id: string;
}

export interface CredentialRow {
  display_name: string;
  username: string;
  email: string;
  password: string;
  project_name: string;
  role: Role;
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
