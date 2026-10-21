import { normalizeAnalyzedNotes, syncAnalyzedFields } from "./analyzed";
import { credentialOrTransportMessage, isTransportFailure, NETWORK_MESSAGE } from "./loginError";
import type {
  AccountInput,
  CredentialRow,
  InviteInput,
  NoteColor,
  NoteItem,
  OtpVaultEntry,
  Profile,
  Project,
  ProjectMember,
  Role,
  Task,
} from "./types";
import { normalizeTaskStatus } from "./types";

const TOKEN_KEY = "kssw-api-token";

function apiBase(): string {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("尚未設定 VITE_API_URL");
  return base;
}

function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    status: normalizeTaskStatus(task.status),
    note: task.note ?? "",
    ...syncAnalyzedFields(normalizeAnalyzedNotes(task)),
  };
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch (error) {
    if (isTransportFailure(error)) throw new Error(NETWORK_MESSAGE);
    throw error;
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const errObj = data && typeof data === "object" ? (data as { error?: string }) : {};
    const message = errObj.error || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(credentialOrTransportMessage({ message, status: res.status }, res.status));
    }
    if (res.status >= 500 || isTransportFailure({ message, status: res.status }, res.status)) {
      throw new Error(NETWORK_MESSAGE);
    }
    throw new Error(message);
  }

  return data as T;
}

/** Neon + Worker API client (replaces supabase-js when VITE_API_URL is set). */
export const neonApi = {
  async signIn(identifier: string, password: string): Promise<Profile> {
    const data = await request<{ token: string; profile: Profile }>("/auth/sign-in", {
      method: "POST",
      json: { identifier: identifier.trim(), password },
    });
    setToken(data.token);
    return data.profile;
  },

  async signOut() {
    try {
      await request("/auth/sign-out", { method: "POST", json: {} });
    } catch {
      /* ignore network on logout */
    }
    setToken(null);
  },

  async currentUser(): Promise<Profile | null> {
    if (!getToken()) return null;
    try {
      return await request<Profile>("/auth/me");
    } catch {
      setToken(null);
      return null;
    }
  },

  async bootstrapAdmin(username: string, password: string, email: string) {
    const data = await request<{ token: string; profile: Profile }>("/auth/bootstrap-admin", {
      method: "POST",
      json: { username, password, email },
    });
    setToken(data.token);
    return data.profile;
  },

  async listProfiles(): Promise<Profile[]> {
    return request<Profile[]>("/api/profiles");
  },

  async listProjects(): Promise<Project[]> {
    return request<Project[]>("/api/projects");
  },

  async createProject(name: string, description: string): Promise<Project> {
    return request<Project>("/api/projects", {
      method: "POST",
      json: { name, description },
    });
  },

  async listLeaderProjectIds(): Promise<string[]> {
    return request<string[]>("/api/projects/leader-ids");
  },

  async deleteProject(id: string) {
    await request(`/api/projects/${id}`, { method: "DELETE" });
  },

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    return request<ProjectMember[]>(`/api/projects/${projectId}/members`);
  },

  async listAllMembers(): Promise<ProjectMember[]> {
    return request<ProjectMember[]>("/api/project-members");
  },

  async myRole(projectId: string): Promise<Role | null> {
    const data = await request<{ role: Role | null }>(`/api/projects/${projectId}/my-role`);
    return data.role;
  },

  async createAccounts(rows: AccountInput[]): Promise<CredentialRow[]> {
    const data = await request<{ credentials: CredentialRow[] }>("/api/admin/invite", {
      method: "POST",
      json: { rows },
    });
    return data.credentials;
  },

  async addProjectMember(projectId: string, userId: string, role: Role): Promise<ProjectMember> {
    return request<ProjectMember>(`/api/projects/${projectId}/members`, {
      method: "POST",
      json: { user_id: userId, role },
    });
  },

  async removeProjectMember(projectId: string, userId: string) {
    await request(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
  },

  async inviteMembers(rows: InviteInput[]): Promise<CredentialRow[]> {
    const data = await request<{ credentials: CredentialRow[] }>("/api/admin/invite", {
      method: "POST",
      json: { rows },
    });
    return data.credentials;
  },

  async changePassword(current: string, next: string) {
    await request("/auth/change-password", {
      method: "POST",
      json: { current, next },
    });
  },

  async resetPassword(userId: string) {
    await request("/api/admin/reset-password", {
      method: "POST",
      json: { user_id: userId },
    });
  },

  async deletePerson(userId: string) {
    await request("/api/admin/delete-person", {
      method: "POST",
      json: { user_id: userId },
    });
  },

  async listTasks(projectId: string): Promise<Task[]> {
    const data = await request<Task[]>(`/api/projects/${projectId}/tasks`);
    return data.map(normalizeTask);
  },

  async createTask(input: Omit<Task, "id">): Promise<Task> {
    const data = await request<Task>("/api/tasks", { method: "POST", json: input });
    return normalizeTask(data);
  },

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    const data = await request<Task>(`/api/tasks/${id}`, { method: "PATCH", json: patch });
    return normalizeTask(data);
  },

  async deleteTask(id: string) {
    await request(`/api/tasks/${id}`, { method: "DELETE" });
  },

  async allTasksForUser(): Promise<Task[]> {
    const data = await request<Task[]>("/api/tasks");
    return data.map(normalizeTask);
  },

  async listNotes(): Promise<NoteItem[]> {
    return request<NoteItem[]>("/api/notes");
  },

  async createNote(input: {
    title: string;
    body: string;
    color: NoteColor;
    url?: string;
  }): Promise<NoteItem> {
    return request<NoteItem>("/api/notes", { method: "POST", json: input });
  },

  async updateNote(
    id: string,
    patch: Partial<{ title: string; body: string; color: NoteColor; url: string; pinned: boolean }>,
  ): Promise<NoteItem> {
    return request<NoteItem>(`/api/notes/${id}`, { method: "PATCH", json: patch });
  },

  async removeNote(id: string) {
    await request(`/api/notes/${id}`, { method: "DELETE" });
  },

  async listOtpEntries(): Promise<OtpVaultEntry[]> {
    return request<OtpVaultEntry[]>("/api/otp");
  },

  async addOtpEntry(input: {
    label?: string;
    issuer?: string;
    account?: string;
    secret: string;
    qr_text?: string;
    thumb?: string;
    access_password?: string;
    owner_id?: string;
  }): Promise<OtpVaultEntry> {
    return request<OtpVaultEntry>("/api/otp", { method: "POST", json: input });
  },

  async removeOtpEntry(id: string) {
    await request(`/api/otp/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async upsertSharedNote(note: NoteItem): Promise<void> {
    await request("/api/notes/upsert", { method: "POST", json: note });
  },

  async upsertOtpEntry(entry: OtpVaultEntry): Promise<void> {
    await request("/api/otp/upsert", { method: "POST", json: entry });
  },
};
