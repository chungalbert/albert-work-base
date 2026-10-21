import { normalizeAnalyzedNotes, syncAnalyzedFields } from "./analyzed";
import { credentialOrTransportMessage, isTransportFailure, NETWORK_MESSAGE } from "./loginError";
import { getSupabase } from "./supabase";
import {
  findStandardProjectColumn,
  isReservedProjectColumnLabel,
  isStandardProjectColumnId,
  seedStandardProjectColumns,
  type ProjectFieldPatch,
} from "./projectsUiStore";
import type {
  AccountInput,
  CredentialRow,
  InviteInput,
  NoteColor,
  NoteItem,
  OtpVaultEntry,
  Profile,
  Project,
  ProjectColumn,
  ProjectMember,
  Role,
  Task,
} from "./types";
import { normalizeTaskStatus } from "./types";
import { DEFAULT_PASSWORD, hasNeonConfig, usernameFromEmail } from "./util";

/** Hidden project row: durable store for custom column defs when Data API cache misses project_columns. */
export const PROJECT_COLUMNS_META_NAME = "__kssw_meta__";
const PROJECT_COLUMNS_DEFS_KEY = "__kssw_column_defs";
/** Set after one-time seed of former builtin middle columns into meta defs. */
const PROJECT_COLUMNS_SEEDED_KEY = "__kssw_columns_seeded";

type StoredProjectColumn = ProjectColumn & { sort_order: number };

function metaSeededFlag(custom: Record<string, string> | undefined): boolean {
  return custom?.[PROJECT_COLUMNS_SEEDED_KEY] === "1";
}

function withSortOrder(columns: ProjectColumn[]): StoredProjectColumn[] {
  return columns.map((col, index) => ({
    id: col.id,
    label: col.label,
    sort_order: index,
  }));
}

function isProjectColumnsMetaProject(project: Pick<Project, "name">): boolean {
  return project.name === PROJECT_COLUMNS_META_NAME;
}

function normalizeProjectRow(row: Project): Project {
  const custom =
    row.custom && typeof row.custom === "object" && !Array.isArray(row.custom)
      ? (row.custom as Record<string, string>)
      : {};
  return {
    ...row,
    lenovo_name: row.lenovo_name ?? "",
    bios_id: row.bios_id ?? "",
    platform: row.platform ?? "",
    dis: row.dis ?? "",
    ss_date: row.ss_date ?? "",
    eol_date: row.eol_date ?? "",
    security_update: row.security_update ?? "",
    talent_policy: row.talent_policy ?? "",
    owner: row.owner ?? "",
    custom,
  };
}

function parseStoredProjectColumns(raw: string | undefined): StoredProjectColumn[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const row = item as { id?: unknown; label?: unknown; sort_order?: unknown };
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const label = typeof row.label === "string" ? row.label.trim() : "";
        if (!id || !label) return null;
        const sort_order = Number(row.sort_order);
        return {
          id,
          label,
          sort_order: Number.isFinite(sort_order) ? sort_order : index,
        };
      })
      .filter((row): row is StoredProjectColumn => Boolean(row));
  } catch {
    return [];
  }
}

function isSchemaCacheMissError(err: unknown): boolean {
  const msg = (
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : err instanceof Error
        ? err.message
        : String(err ?? "")
  ).toLowerCase();
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  return (
    code === "PGRST205" ||
    code === "PGRST202" ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the function")
  );
}

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
  if (!client) throw new Error("尚未設定 Supabase 或 Neon");
  return client;
}

/** Better Auth client behind Neon SupabaseAuthAdapter (admin.createUser / setUserPassword / removeUser). */
function neonBetterAuth() {
  const auth = sb().auth as {
    getBetterAuthInstance?: () => {
      admin: {
        createUser: (input: {
          email: string;
          password: string;
          name: string;
          role?: string;
          data?: Record<string, unknown>;
        }) => Promise<{ data?: { user?: { id: string } }; user?: { id: string }; error?: { message?: string } }>;
        setUserPassword: (input: { userId: string; newPassword: string }) => Promise<{ error?: { message?: string } }>;
        removeUser: (input: { userId: string }) => Promise<{ error?: { message?: string } }>;
        setRole: (input: { userId: string; role: string }) => Promise<{ error?: { message?: string } }>;
      };
    };
  };
  const instance = auth.getBetterAuthInstance?.();
  if (!instance?.admin) {
    throw new Error("Neon Auth admin API 不可用");
  }
  return instance;
}

function neonAdminErrorMessage(err: unknown, fallback: string): string {
  const message =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : "";
  const status =
    err && typeof err === "object" && "status" in err ? Number((err as { status: unknown }).status) : NaN;
  if (status === 403 || /forbidden|not admin|unauthorized|permission/i.test(message)) {
    return "Neon Auth 需要 Admin 角色：請在 Neon Console → Auth → Users 對此帳號選 Make admin（與 Personnel Admin 不同）";
  }
  return message || fallback;
}

async function createAccountsViaNeon(rows: AccountInput[]): Promise<CredentialRow[]> {
  const me = await cloudApi.currentUser();
  if (!me) throw new Error("尚未登入");
  const canCreate =
    Boolean(me.is_admin) ||
    (await cloudApi.listAllMembers()).some((m) => m.user_id === me.id && m.role === "leader");
  if (!canCreate) throw new Error("只有專案領導或管理員可以開通帳號");

  const betterAuth = neonBetterAuth();
  const existingProfiles = await cloudApi.listProfiles();
  const taken = new Set(existingProfiles.map((p) => p.username.toLowerCase()));
  const credentials: CredentialRow[] = [];

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email || !row.display_name?.trim()) continue;

    const existing = existingProfiles.find((p) => p.email.toLowerCase() === email);
    if (existing) {
      credentials.push({
        display_name: existing.display_name,
        username: existing.username,
        email: existing.email,
        password: "(已有帳號，沿用原密碼)",
      });
      continue;
    }

    const username = usernameFromEmail(email, taken);
    taken.add(username);
    const password = DEFAULT_PASSWORD;
    const display_name = row.display_name.trim();
    const unit = row.unit?.trim() ?? "";

    let userId = "";
    try {
      const created = await betterAuth.admin.createUser({
        email,
        password,
        name: display_name,
        role: "user",
        data: { username, display_name, unit },
      });
      if (created?.error?.message) throw new Error(created.error.message);
      userId = created?.data?.user?.id ?? created?.user?.id ?? "";
    } catch (err) {
      throw new Error(neonAdminErrorMessage(err, "建立 Neon 帳號失敗"));
    }
    if (!userId) throw new Error("建立 Neon 帳號失敗：沒有回傳使用者 id");

    const { error: insertError } = await sb().from("profiles").insert({
      id: userId,
      username,
      display_name,
      unit,
      email,
      is_admin: false,
    });
    if (insertError) throw insertError;

    existingProfiles.push({
      id: userId,
      username,
      display_name,
      unit,
      email,
      is_admin: false,
    });
    credentials.push({ display_name, username, email, password });
  }

  return credentials;
}

async function invokeInviteMembers(body: Record<string, unknown>) {
  const { data, error } = await sb().functions.invoke("invite-members", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function ensureOwnProfile(): Promise<Profile | null> {
  const existing = await cloudApi.currentUser();
  if (existing) return existing;
  const client = sb();
  const { data: session } = await client.auth.getSession();
  const user = session.session?.user;
  if (!user?.id || !user.email) return null;
  const meta = (user.user_metadata ?? {}) as { username?: string; display_name?: string; unit?: string };
  const username = (meta.username || user.email.split("@")[0] || "user").slice(0, 24);
  const { error } = await client.from("profiles").insert({
    id: user.id,
    username,
    display_name: meta.display_name || username,
    email: user.email,
    unit: meta.unit || "",
    is_admin: false,
  });
  if (error && !/duplicate|already exists|unique/i.test(error.message)) throw error;
  return cloudApi.currentUser();
}

export const cloudApi = {
  async signIn(identifier: string, password: string): Promise<Profile> {
    const client = sb();
    let email = identifier.trim();
    if (!email.includes("@")) {
      const lookedUp = await client.rpc("lookup_login_email", {
        identifier: email,
      });
      if (lookedUp.error || !lookedUp.data) {
        throw new Error(credentialOrTransportMessage(lookedUp.error, lookedUp.status));
      }
      email = lookedUp.data as string;
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      if (isTransportFailure(error)) throw new Error(NETWORK_MESSAGE);
      throw new Error(error.message === "Invalid login credentials" ? "帳號或密碼不正確。" : error.message);
    }
    const profile = await ensureOwnProfile();
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
      const profile = await ensureOwnProfile();
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
    return (data as Project[])
      .map(normalizeProjectRow)
      .filter((project) => !isProjectColumnsMetaProject(project));
  },

  async createProject(name: string, description: string): Promise<Project> {
    const me = await cloudApi.currentUser();
    if (!me) throw new Error("尚未登入");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("專案名稱不能空白");
    if (trimmed === PROJECT_COLUMNS_META_NAME) {
      throw new Error("此專案名稱為系統保留");
    }
    const { data, error } = await sb()
      .from("projects")
      .insert({ name: trimmed, description, created_by: me.id })
      .select()
      .single();
    if (error) throw error;
    return normalizeProjectRow(data as Project);
  },

  async updateProject(projectId: string, patch: ProjectFieldPatch): Promise<Project> {
    const projects = await cloudApi.listProjects();
    const base = projects.find((p) => p.id === projectId);
    if (!base) throw new Error("找不到專案");

    const updates: Record<string, string | Record<string, string>> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("專案名稱不能空白");
      updates.name = name;
    }
    if (patch.description !== undefined) updates.description = patch.description.trim();
    if (patch.lenovo_name !== undefined) updates.lenovo_name = patch.lenovo_name.trim();
    if (patch.bios_id !== undefined) updates.bios_id = patch.bios_id.trim();
    if (patch.platform !== undefined) updates.platform = patch.platform.trim();
    if (patch.dis !== undefined) updates.dis = patch.dis.trim();
    if (patch.ss_date !== undefined) updates.ss_date = patch.ss_date.trim();
    if (patch.eol_date !== undefined) updates.eol_date = patch.eol_date.trim();
    if (patch.security_update !== undefined) updates.security_update = patch.security_update.trim();
    if (patch.talent_policy !== undefined) updates.talent_policy = patch.talent_policy.trim();
    if (patch.owner !== undefined) updates.owner = patch.owner.trim();
    if (patch.custom !== undefined) {
      updates.custom = { ...(base.custom ?? {}), ...patch.custom };
    }
    if (Object.keys(updates).length === 0) return base;

    const { data, error } = await sb()
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();
    if (error) throw error;
    return normalizeProjectRow(data as Project);
  },

  /** Ask PostgREST to reload its schema cache (admin-only SECURITY DEFINER). */
  async reloadPgrstSchema(): Promise<void> {
    const { error } = await sb().rpc("reload_pgrst_schema");
    if (error) throw error;
  },

  /**
   * Ensure the hidden meta project that stores column defs in projects.custom.
   * Neon Data API often returns PGRST205 for project_columns INSERT even when the table
   * exists; projects.custom PATCH is reliable and does not need a schema-cache refresh.
   */
  async ensureProjectColumnsMeta(): Promise<Project> {
    const { data, error } = await sb()
      .from("projects")
      .select("*")
      .eq("name", PROJECT_COLUMNS_META_NAME)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return normalizeProjectRow(data as Project);

    const me = await cloudApi.currentUser();
    if (!me) throw new Error("尚未登入");
    const seeded = seedStandardProjectColumns([], false);
    const { data: created, error: createError } = await sb()
      .from("projects")
      .insert({
        name: PROJECT_COLUMNS_META_NAME,
        description: "System: shared project column definitions",
        created_by: me.id,
        custom: {
          [PROJECT_COLUMNS_DEFS_KEY]: JSON.stringify(withSortOrder(seeded.columns)),
          [PROJECT_COLUMNS_SEEDED_KEY]: "1",
        },
      })
      .select()
      .single();
    if (createError) throw createError;
    return normalizeProjectRow(created as Project);
  },

  async listProjectColumnsFromMeta(): Promise<StoredProjectColumn[]> {
    const meta = await cloudApi.ensureProjectColumnsMeta();
    return parseStoredProjectColumns(meta.custom?.[PROJECT_COLUMNS_DEFS_KEY]).sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
    );
  },

  async saveProjectColumnsToMeta(
    columns: StoredProjectColumn[],
    options?: { markSeeded?: boolean },
  ): Promise<void> {
    const meta = await cloudApi.ensureProjectColumnsMeta();
    const normalized = columns
      .map((col, index) => ({
        id: col.id,
        label: col.label.trim(),
        sort_order: Number.isFinite(col.sort_order) ? col.sort_order : index,
      }))
      .filter((col) => col.id && col.label)
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    const nextCustom: Record<string, string> = {
      ...(meta.custom ?? {}),
      [PROJECT_COLUMNS_DEFS_KEY]: JSON.stringify(normalized),
    };
    if (options?.markSeeded || metaSeededFlag(meta.custom)) {
      nextCustom[PROJECT_COLUMNS_SEEDED_KEY] = "1";
    }
    const { error } = await sb().from("projects").update({ custom: nextCustom }).eq("id", meta.id);
    if (error) throw error;
  },

  async listProjectColumnsFromTable(): Promise<StoredProjectColumn[]> {
    const { data, error } = await sb()
      .from("project_columns")
      .select("id, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as { id: string; label: string; sort_order: number }[]).map((row, index) => ({
      id: row.id,
      label: row.label,
      sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
    }));
  },

  async listProjectColumns(): Promise<ProjectColumn[]> {
    let tableCols: StoredProjectColumn[] = [];
    try {
      tableCols = await cloudApi.listProjectColumnsFromTable();
    } catch (err) {
      if (!isSchemaCacheMissError(err)) throw err;
    }
    const meta = await cloudApi.ensureProjectColumnsMeta();
    const metaCols = parseStoredProjectColumns(meta.custom?.[PROJECT_COLUMNS_DEFS_KEY]).sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
    );
    const alreadySeeded = metaSeededFlag(meta.custom);
    // After seed, meta is the membership source of truth (table is best-effort mirror).
    // Otherwise a failed project_columns DELETE would resurrect removed columns.
    const mergedStored = (() => {
      const byId = new Map<string, StoredProjectColumn>();
      for (const col of metaCols) byId.set(col.id, col);
      for (const col of tableCols) {
        const prev = byId.get(col.id);
        if (prev) {
          byId.set(col.id, { ...prev, ...col, label: col.label || prev.label });
        } else if (!alreadySeeded) {
          byId.set(col.id, col);
        }
      }
      return [...byId.values()].sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
      );
    })();
    const seeded = seedStandardProjectColumns(
      mergedStored.map(({ id, label }) => ({ id, label })),
      alreadySeeded,
    );
    const finalStored = withSortOrder(seeded.columns);

    // Keep meta as durable mirror so Add Column survives project_columns PGRST205.
    const metaKey = metaCols
      .map((c) => `${c.id}:${c.label}:${c.sort_order}`)
      .sort()
      .join("|");
    const finalKey = finalStored
      .map((c) => `${c.id}:${c.label}:${c.sort_order}`)
      .sort()
      .join("|");
    const needWrite = finalKey !== metaKey || seeded.changed || (seeded.seeded && !alreadySeeded);
    if (needWrite) {
      try {
        await cloudApi.saveProjectColumnsToMeta(finalStored, { markSeeded: seeded.seeded });
      } catch {
        /* non-admin readers may lack update — listing still works from merge */
      }
    }

    return finalStored.map(({ id, label }) => ({ id, label }));
  },

  async addProjectColumn(label: string, id?: string): Promise<ProjectColumn> {
    const me = await cloudApi.currentUser();
    if (!me) throw new Error("尚未登入");
    if (!me.is_admin) throw new Error("只有管理員可以新增欄位");
    const trimmed = label.trim();
    if (!trimmed) throw new Error("欄位名稱不能空白");
    if (isReservedProjectColumnLabel(trimmed)) {
      throw new Error(`「${trimmed}」是固定欄位，無法再新增`);
    }

    const existing = await cloudApi.listProjectColumns();
    if (existing.some((c) => c.label.trim().toUpperCase() === trimmed.toUpperCase())) {
      throw new Error("欄位名稱已存在");
    }

    const std = findStandardProjectColumn(trimmed);
    if (std && existing.some((c) => c.id === std.id)) {
      throw new Error("欄位名稱已存在");
    }

    const metaCols = await cloudApi.listProjectColumnsFromMeta();
    const maxOrder = metaCols.reduce((max, row) => Math.max(max, row.sort_order), -1);
    const col: StoredProjectColumn = {
      id: std?.id ?? id ?? crypto.randomUUID(),
      label: std?.label ?? trimmed,
      sort_order: maxOrder + 1,
    };

    // Durable path first: projects.custom is always in the Data API schema cache.
    await cloudApi.saveProjectColumnsToMeta([...metaCols, col], { markSeeded: true });

    // Best-effort mirror into project_columns (may 404 PGRST205 on Neon until Console refresh).
    try {
      const { error } = await sb()
        .from("project_columns")
        .insert({
          id: col.id,
          label: col.label,
          sort_order: col.sort_order,
          created_by: me.id,
        });
      if (error && !isSchemaCacheMissError(error)) {
        // Unique race with a concurrent table insert — meta already has the row.
        const code = String((error as { code?: string }).code ?? "");
        if (code !== "23505") throw error;
      }
    } catch (err) {
      if (!isSchemaCacheMissError(err)) throw err;
    }

    return { id: col.id, label: col.label };
  },

  async removeProjectColumn(columnId: string) {
    const me = await cloudApi.currentUser();
    if (!me) throw new Error("尚未登入");
    if (!me.is_admin) throw new Error("只有管理員可以刪除欄位");

    const metaCols = await cloudApi.listProjectColumnsFromMeta();
    const target = metaCols.find((col) => col.id === columnId);
    if (target && isReservedProjectColumnLabel(target.label)) {
      throw new Error("固定欄位無法刪除");
    }

    await cloudApi.saveProjectColumnsToMeta(
      metaCols.filter((col) => col.id !== columnId),
      { markSeeded: true },
    );

    try {
      const { error } = await sb().from("project_columns").delete().eq("id", columnId);
      if (error && !isSchemaCacheMissError(error)) throw error;
    } catch (err) {
      if (!isSchemaCacheMissError(err)) throw err;
    }

    // Standard middle columns keep values on projects.* fields so re-add restores cells.
    if (isStandardProjectColumnId(columnId)) return;

    // Strip custom cell values for this column from every visible project (best-effort).
    const projects = await cloudApi.listProjects();
    for (const project of projects) {
      if (!project.custom || !(columnId in project.custom)) continue;
      const nextCustom = { ...project.custom };
      delete nextCustom[columnId];
      const { error: updateError } = await sb()
        .from("projects")
        .update({ custom: nextCustom })
        .eq("id", project.id);
      if (updateError) throw updateError;
    }
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
    const { data: row, error: readError } = await sb().from("projects").select("name").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (row && isProjectColumnsMetaProject(row as Project)) {
      throw new Error("系統保留專案無法刪除");
    }
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
    // Neon Auth has no Edge Functions — use Better Auth admin.createUser + profiles insert.
    if (hasNeonConfig()) return createAccountsViaNeon(rows);
    const data = await invokeInviteMembers({ rows });
    return data.credentials as CredentialRow[];
  },

  /** After Add Member: persist Personnel fields and promote Neon Auth admin when needed. */
  async syncPersonnelProfile(
    userId: string,
    patch: { username?: string; display_name?: string; unit?: string; is_admin?: boolean },
  ) {
    if (!hasNeonConfig()) return;
    const updates: Record<string, string | boolean> = {};
    if (patch.username !== undefined) updates.username = patch.username;
    if (patch.display_name !== undefined) updates.display_name = patch.display_name;
    if (patch.unit !== undefined) updates.unit = patch.unit;
    if (patch.is_admin !== undefined) updates.is_admin = patch.is_admin;
    if (Object.keys(updates).length > 0) {
      const { error } = await sb().from("profiles").update(updates).eq("id", userId);
      if (error) throw error;
    }
    if (patch.is_admin) {
      try {
        const result = await neonBetterAuth().admin.setRole({ userId, role: "admin" });
        if (result?.error?.message) throw new Error(result.error.message);
      } catch (err) {
        throw new Error(neonAdminErrorMessage(err, "設定 Neon Auth Admin 失敗"));
      }
    }
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
    if (hasNeonConfig()) {
      const creds = await createAccountsViaNeon(rows);
      for (const row of rows) {
        const email = row.email.trim().toLowerCase();
        if (!email || !row.project_id) continue;
        const profiles = await cloudApi.listProfiles();
        const profile = profiles.find((p) => p.email.toLowerCase() === email);
        if (!profile) continue;
        await cloudApi.addProjectMember(row.project_id, profile.id, row.role ?? "member");
      }
      return creds;
    }
    const data = await invokeInviteMembers({ rows });
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
    if (hasNeonConfig()) {
      const me = await cloudApi.currentUser();
      if (!me) throw new Error("尚未登入");
      const target = (await cloudApi.listProfiles()).find((p) => p.id === userId);
      if (!target) throw new Error("找不到這位人員");
      if (target.is_admin && !me.is_admin) throw new Error("不能重設管理員密碼");
      const canReset =
        Boolean(me.is_admin) ||
        (await cloudApi.listAllMembers()).some(
          (m) => m.user_id === me.id && m.role === "leader",
        );
      if (!canReset) throw new Error("只有專案領導或管理員可以重設密碼");
      try {
        const result = await neonBetterAuth().admin.setUserPassword({
          userId,
          newPassword: DEFAULT_PASSWORD,
        });
        if (result?.error?.message) throw new Error(result.error.message);
      } catch (err) {
        throw new Error(neonAdminErrorMessage(err, "重設密碼失敗"));
      }
      return;
    }
    await invokeInviteMembers({ reset_user_id: userId });
  },

  async deletePerson(userId: string) {
    if (hasNeonConfig()) {
      const me = await cloudApi.currentUser();
      if (!me) throw new Error("尚未登入");
      if (userId === me.id) throw new Error("不能刪除自己");
      const target = (await cloudApi.listProfiles()).find((p) => p.id === userId);
      if (!target) throw new Error("找不到這位人員");
      if (target.is_admin) throw new Error("不能刪除管理員");
      if (!me.is_admin) {
        const canDelete = (await cloudApi.listAllMembers()).some(
          (m) => m.user_id === me.id && m.role === "leader",
        );
        if (!canDelete) throw new Error("只有專案領導或管理員可以刪除人員");
      }
      const client = sb();
      await client.from("project_members").delete().eq("user_id", userId);
      await client.from("tasks").update({ assignee_id: null }).eq("assignee_id", userId);
      await client.from("projects").update({ created_by: me.id }).eq("created_by", userId);
      const removed = await client.from("profiles").delete().eq("id", userId);
      if (removed.error) throw removed.error;
      try {
        const result = await neonBetterAuth().admin.removeUser({ userId });
        if (result?.error?.message) throw new Error(result.error.message);
      } catch (err) {
        throw new Error(neonAdminErrorMessage(err, "刪除 Neon 帳號失敗"));
      }
      return;
    }
    await invokeInviteMembers({ delete_user_id: userId });
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
