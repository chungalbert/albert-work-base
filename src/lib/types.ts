export type Role = "leader" | "member";
export const TASK_STATUSES = [
  { id: "opening", label: "Opening" },
  { id: "working", label: "Working" },
  { id: "closing", label: "Closing" },
  { id: "verify", label: "Verify" },
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number]["id"];
export type ViewId =
  | "home"
  | "projects"
  | "people"
  | "tasks"
  | "gantt"
  | "security"
  | "inv-pcr"
  | "guides"
  | "notes"
  | "chat"
  | "tool"
  | "otp"
  | "whea";

/** Shared TOTP vault entry (org-wide; secrets never committed to git). */
export interface OtpVaultEntry {
  id: string;
  label: string;
  issuer: string;
  account: string;
  /** Base32 secret — never commit real values. */
  secret: string;
  /** Optional otpauth:// URI or QR payload text. */
  qr_text?: string;
  /** Optional data-URL thumbnail. */
  thumb?: string;
  /** Creator username/id for audit only — does not filter list visibility. */
  owner_id?: string;
  /** If set, codes stay locked until unlocked this session. */
  access_password?: string;
  /** Unix seconds. */
  created_at: number;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export const NOTE_COLORS = ["blue", "purple", "green", "yellow", "pink", "orange"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface NoteItem {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  pinned: boolean;
  /** Optional link opened by the globe action. */
  url?: string;
  created_at: string;
  updated_at: string;
}

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

export const PERSONNEL_ROLES = ["Admin", "DM", "DL", "DE"] as const;
export type PersonnelRole = (typeof PERSONNEL_ROLES)[number];

export interface PersonnelColumn {
  id: string;
  label: string;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  unit: string;
  email: string;
  is_admin: boolean;
  /** Org role shown on Personnel (Admin / DM / DL / DE). */
  personnel_role?: PersonnelRole;
  /** Values for user-defined Personnel columns. */
  custom?: Record<string, string>;
}

export function normalizePersonnelRole(profile: Pick<Profile, "is_admin" | "personnel_role">): PersonnelRole {
  if (profile.personnel_role && (PERSONNEL_ROLES as readonly string[]).includes(profile.personnel_role)) {
    return profile.personnel_role;
  }
  return profile.is_admin ? "Admin" : "DE";
}

export interface ProjectColumn {
  id: string;
  label: string;
}

export interface Project {
  id: string;
  /** Compal project name (primary display name). */
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  lenovo_name?: string;
  bios_id?: string;
  platform?: string;
  dis?: string;
  ss_date?: string;
  eol_date?: string;
  security_update?: string;
  talent_policy?: string;
  /** Project owner (standard middle column; removable via Admin column defs). */
  owner?: string;
  /** Values for user-defined Projects columns. */
  custom?: Record<string, string>;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: Role;
}

export interface AnalyzedNote {
  id: string;
  text: string;
  by: string | null;
  at: string | null;
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
  analyzed_by: string | null;
  analyzed_at: string | null;
  analyzed_notes: AnalyzedNote[];
}

export interface AccountInput {
  display_name: string;
  unit: string;
  email: string;
}

export interface CreatePersonnelInput {
  display_name: string;
  /** Login id; if omitted, derived from email. */
  username?: string;
  /** If omitted and username is set, local mode uses username@local. */
  email?: string;
  phone?: string;
  personnel_role: PersonnelRole;
  projectIds?: string[];
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
