import { normalizeAnalyzedNotes, syncAnalyzedFields } from "./analyzed";
import { getSupabase } from "./supabase";
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

function normalizeTask(task: Task): Task {
  return {
    ...task,
    status: normalizeTaskStatus(task.status),
    note: task.note ?? "",
    ...syncAnalyzedFields(normalizeAnalyzedNotes(task)),
  };
}

function sb() {
  const client = getSupabase();
  if (!client) throw new Error("尚未設定 Supabase");
  return client;
}

export const cloudApi = {
  async signIn(identifier: string, password: string): Promise<Profile> {
    const client = sb();
    let email = identifier.trim();
    if (!email.includes("@")) {
      const { data, error } = await client.rpc("lookup_login_email", {
        identifier: email,
      });
      if (error || !data) throw new Error("帳號或密碼不正確。");
      email = data as string;
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "帳號或密碼不正確。" : error.message);
    const profile = await cloudApi.currentUser();
    if (!profile) throw new Error("找不到個人資料");
    return profile;
  },

  async signOut() {
    await sb().auth.signOut();
  },

  async currentUser(): Promise<Profile | null> {
    const client = sb();
    const { data: session } = await client.auth.getSession();
    const id = session.session?.user.id;
    if (!id) return null;
    const { data, error } = await client.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  },

  async bootstrapAdmin(username: string, password: string, email: string) {
    const client = sb();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: username,
          unit: "工作基地",
        },
      },
    });
    if (error) throw new Error(error.message);
    if (!data.session) {
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error) throw new Error(signedIn.error.message);
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const profile = await cloudApi.currentUser();
      if (profile) return profile;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("帳號已建立，請再用同一個帳號或 EMAIL 登入。");
  },

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await sb().from("profiles").select("*").order("display_name");
    if (error) throw error;
    return data as Profile[];
  },

  async listProjects(): Promise<Project[]> {
    const { data, error } = await sb().from("projects").select("*").order("created_at");
    if (error) throw error;
    return data as Project[];
  },

  async createProject(name: string, description: string): Promise<Project> {
    const me = await cloudApi.currentUser();
    if (!me) throw new Error("尚未登入");
    const { data, error } = await sb()
      .from("projects")
      .insert({ name, description, created_by: me.id })
      .select()
      .single();
    if (error) throw error;
    return data as Project;
  },

  async listLeaderProjectIds(): Promise<string[]> {
    const me = await cloudApi.currentUser();
    if (!me) return [];
    if (me.is_admin) {
      const projects = await cloudApi.listProjects();
      return projects.map((p) => p.id);
    }
    const { data, error } = await sb()
      .from("project_members")
      .select("project_id")
      .eq("user_id", me.id)
      .eq("role", "leader");
    if (error) throw error;
    return (data ?? []).map((row: { project_id: string }) => row.project_id);
  },

  async deleteProject(id: string) {
    const { error } = await sb().from("projects").delete().eq("id", id);
    if (error) throw error;
  },

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const { data, error } = await sb()
      .from("project_members")
      .select("*")
      .eq("project_id", projectId);
    if (error) throw error;
    return data as ProjectMember[];
  },

  async listAllMembers(): Promise<ProjectMember[]> {
    const { data, error } = await sb().from("project_members").select("*");
    if (error) throw error;
    return data as ProjectMember[];
  },

  async myRole(projectId: string): Promise<Role | null> {
    const me = await cloudApi.currentUser();
    if (!me) return null;
    if (me.is_admin) return "leader";
    const members = await cloudApi.listMembers(projectId);
    return members.find((m) => m.user_id === me.id)?.role ?? null;
  },

  async createAccounts(rows: AccountInput[]): Promise<CredentialRow[]> {
    const { data, error } = await sb().functions.invoke("invite-members", { body: { rows } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.credentials as CredentialRow[];
  },

  async addProjectMember(projectId: string, userId: string, role: Role): Promise<ProjectMember> {
    const members = await cloudApi.listMembers(projectId);
    const existing = members.find((m) => m.user_id === userId);
    if (existing?.role === "leader" && role !== "leader") {
      const leaders = members.filter((m) => m.role === "leader");
      if (leaders.length <= 1) throw new Error("專案至少要有一位領導");
    }
    const { data, error } = await sb()
      .from("project_members")
      .upsert({ project_id: projectId, user_id: userId, role })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectMember;
  },

  async removeProjectMember(projectId: string, userId: string) {
    const members = await cloudApi.listMembers(projectId);
    const target = members.find((m) => m.user_id === userId);
    if (!target) return;
    if (target.role === "leader") {
      const leaders = members.filter((m) => m.role === "leader");
      if (leaders.length <= 1) throw new Error("專案至少要有一位領導");
    }
    const { error } = await sb()
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async inviteMembers(rows: InviteInput[]): Promise<CredentialRow[]> {
    const { data, error } = await sb().functions.invoke("invite-members", { body: { rows } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.credentials as CredentialRow[];
  },

  async changePassword(current: string, next: string) {
    const me = await cloudApi.currentUser();
    if (!me) throw new Error("尚未登入");
    const nextPassword = next.trim();
    if (nextPassword.length < 6) throw new Error("新密碼至少 6 碼");
    const { error: check } = await sb().auth.signInWithPassword({
      email: me.email,
      password: current,
    });
    if (check) throw new Error("目前密碼不正確");
    const { error } = await sb().auth.updateUser({ password: nextPassword });
    if (error) throw error;
  },

  async resetPassword(userId: string) {
    const { data, error } = await sb().functions.invoke("invite-members", {
      body: { reset_user_id: userId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  },

  async deletePerson(userId: string) {
    const { data, error } = await sb().functions.invoke("invite-members", {
      body: { delete_user_id: userId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  },

  async listTasks(projectId: string): Promise<Task[]> {
    const { data, error } = await sb()
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("due_date");
    if (error) throw error;
    return (data as Task[]).map(normalizeTask);
  },

  async createTask(input: Omit<Task, "id">): Promise<Task> {
    const { data, error } = await sb().from("tasks").insert(input).select().single();
    if (error) throw error;
    return normalizeTask(data as Task);
  },

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    const { data, error } = await sb().from("tasks").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return normalizeTask(data as Task);
  },

  async deleteTask(id: string) {
    const { error } = await sb().from("tasks").delete().eq("id", id);
    if (error) throw error;
  },

  async allTasksForUser(): Promise<Task[]> {
    const { data, error } = await sb().from("tasks").select("*");
    if (error) throw error;
    return (data as Task[]).map(normalizeTask);
  },

  async listNotes(): Promise<NoteItem[]> {
    const { data, error } = await sb().from("shared_notes").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      color: (row.color as NoteColor) || "blue",
      pinned: Boolean(row.pinned),
      url: (row.url as string | null)?.trim() || undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }));
  },

  async createNote(input: {
    title: string;
    body: string;
    color: NoteColor;
    url?: string;
  }): Promise<NoteItem> {
    const me = await cloudApi.currentUser();
    const { data, error } = await sb()
      .from("shared_notes")
      .insert({
        title: input.title.trim(),
        body: input.body.trim(),
        color: input.color,
        url: input.url?.trim() || null,
        pinned: false,
        created_by: me?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id as string,
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
      color: (data.color as NoteColor) || "blue",
      pinned: Boolean(data.pinned),
      url: (data.url as string | null)?.trim() || undefined,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
    };
  },

  async updateNote(
    id: string,
    patch: Partial<{ title: string; body: string; color: NoteColor; url: string; pinned: boolean }>,
  ): Promise<NoteItem> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) row.title = patch.title.trim();
    if (patch.body !== undefined) row.body = patch.body.trim();
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.url !== undefined) row.url = patch.url.trim() || null;
    if (patch.pinned !== undefined) row.pinned = patch.pinned;
    const { data, error } = await sb().from("shared_notes").update(row).eq("id", id).select().single();
    if (error) throw error;
    return {
      id: data.id as string,
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
      color: (data.color as NoteColor) || "blue",
      pinned: Boolean(data.pinned),
      url: (data.url as string | null)?.trim() || undefined,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
    };
  },

  async removeNote(id: string) {
    const { error } = await sb().from("shared_notes").delete().eq("id", id);
    if (error) throw error;
  },

  async listOtpEntries(): Promise<OtpVaultEntry[]> {
    const { data, error } = await sb().from("otp_vault_entries").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: String(row.id),
      label: String(row.label ?? ""),
      issuer: String(row.issuer ?? ""),
      account: String(row.account ?? ""),
      secret: String(row.secret ?? ""),
      qr_text: (row.qr_text as string | null)?.trim() || undefined,
      thumb: (row.thumb as string | null)?.trim() || undefined,
      access_password: (row.access_password as string | null)?.trim() || undefined,
      owner_id: row.created_by ? String(row.created_by) : undefined,
      created_at: Number(row.created_at) || Math.floor(Date.now() / 1000),
    }));
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
    const me = await cloudApi.currentUser();
    const issuer = (input.issuer ?? "").trim();
    const account = (input.account ?? "").trim();
    const label =
      (input.label ?? "").trim() ||
      (issuer && account ? `${issuer} · ${account}` : issuer || account || "OTP entry");
    const id = `otp_${crypto.randomUUID()}`;
    const created_at = Math.floor(Date.now() / 1000);
    const { data, error } = await sb()
      .from("otp_vault_entries")
      .insert({
        id,
        label,
        issuer,
        account,
        secret: input.secret.replace(/\s+/g, "").toUpperCase(),
        qr_text: input.qr_text?.trim() || null,
        thumb: input.thumb?.trim() || null,
        access_password: input.access_password?.trim() || null,
        created_by: me?.id ?? null,
        created_at,
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: String(data.id),
      label: String(data.label ?? ""),
      issuer: String(data.issuer ?? ""),
      account: String(data.account ?? ""),
      secret: String(data.secret ?? ""),
      qr_text: (data.qr_text as string | null)?.trim() || undefined,
      thumb: (data.thumb as string | null)?.trim() || undefined,
      access_password: (data.access_password as string | null)?.trim() || undefined,
      owner_id: data.created_by ? String(data.created_by) : input.owner_id,
      created_at: Number(data.created_at) || created_at,
    };
  },

  async removeOtpEntry(id: string) {
    const { error } = await sb().from("otp_vault_entries").delete().eq("id", id);
    if (error) throw error;
  },

  /** Upsert a local leftover note into the org-shared table (preserves id). */
  async upsertSharedNote(note: NoteItem): Promise<void> {
    const { error } = await sb().from("shared_notes").upsert(
      {
        id: note.id,
        title: note.title,
        body: note.body,
        color: note.color,
        pinned: Boolean(note.pinned),
        url: note.url?.trim() || null,
        created_at: note.created_at,
        updated_at: note.updated_at,
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  },

  /** Upsert a local leftover OTP entry (preserves id; never log secret). */
  async upsertOtpEntry(entry: OtpVaultEntry): Promise<void> {
    const me = await cloudApi.currentUser();
    const ownerLooksLikeUuid = Boolean(entry.owner_id && /^[0-9a-f-]{36}$/i.test(entry.owner_id));
    const { error } = await sb().from("otp_vault_entries").upsert(
      {
        id: entry.id,
        label: entry.label,
        issuer: entry.issuer,
        account: entry.account,
        secret: entry.secret.replace(/\s+/g, "").toUpperCase(),
        qr_text: entry.qr_text?.trim() || null,
        thumb: entry.thumb?.trim() || null,
        access_password: entry.access_password?.trim() || null,
        created_by: ownerLooksLikeUuid ? entry.owner_id : me?.id ?? null,
        created_at: entry.created_at,
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  },
};
