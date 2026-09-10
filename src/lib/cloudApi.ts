import { getSupabase } from "./supabase";
import type {
  AccountInput,
  CredentialRow,
  InviteInput,
  Profile,
  Project,
  ProjectMember,
  Role,
  Task,
} from "./types";

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
    if (error) throw new Error("帳號或密碼不正確。");
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
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: "Albert",
          unit: "工作基地",
        },
      },
    });
    if (error) throw error;
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

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const { data, error } = await sb()
      .from("project_members")
      .select("*")
      .eq("project_id", projectId);
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
    const { data, error } = await sb()
      .from("project_members")
      .upsert({ project_id: projectId, user_id: userId, role })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectMember;
  },

  async inviteMembers(rows: InviteInput[]): Promise<CredentialRow[]> {
    const { data, error } = await sb().functions.invoke("invite-members", { body: { rows } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.credentials as CredentialRow[];
  },

  async listTasks(projectId: string): Promise<Task[]> {
    const { data, error } = await sb()
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("due_date");
    if (error) throw error;
    return data as Task[];
  },

  async createTask(input: Omit<Task, "id">): Promise<Task> {
    const { data, error } = await sb().from("tasks").insert(input).select().single();
    if (error) throw error;
    return data as Task;
  },

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    const { data, error } = await sb().from("tasks").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data as Task;
  },

  async deleteTask(id: string) {
    const { error } = await sb().from("tasks").delete().eq("id", id);
    if (error) throw error;
  },

  async allTasksForUser(): Promise<Task[]> {
    const { data, error } = await sb().from("tasks").select("*");
    if (error) throw error;
    return data as Task[];
  },
};
