import { todayISO } from "./dates";
import type {
  CredentialRow,
  InviteInput,
  AccountInput,
  Profile,
  Project,
  ProjectMember,
  Role,
  Task,
} from "./types";
import { DEFAULT_PASSWORD, sha256, usernameFromEmail } from "./util";

const KEY = "awb-store-v1";
const ADMIN_HASH = "4dcaa92c01008dd30fa65408b02c8b400a00e6c6f20065fbf3be39c908c4ed20";

interface Store {
  sessionUserId: string | null;
  profiles: Profile[];
  passwordHashes: Record<string, string>;
  projects: Project[];
  members: ProjectMember[];
  tasks: Task[];
  passwordScheme?: number;
}

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";

function emptyStore(): Store {
  const admin: Profile = {
    id: ADMIN_ID,
    username: "admin",
    display_name: "Albert",
    unit: "工作基地",
    email: "admin@local",
    is_admin: true,
  };
  return {
    sessionUserId: null,
    profiles: [admin],
    passwordHashes: { [ADMIN_ID]: ADMIN_HASH },
    projects: [],
    members: [],
    tasks: [],
  };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Store;
    if (!parsed.profiles?.length) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function save(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

const PASSWORD_SCHEME = 2;

async function ensurePasswordScheme() {
  const store = load();
  if (store.passwordScheme === PASSWORD_SCHEME) return;
  for (const profile of store.profiles) {
    if (profile.is_admin) continue;
    store.passwordHashes[profile.id] = await sha256(`${profile.username}:${DEFAULT_PASSWORD}`);
  }
  store.passwordScheme = PASSWORD_SCHEME;
  save(store);
}

async function passwordMatches(store: Store, profile: Profile, password: string) {
  const stored = store.passwordHashes[profile.id];
  if (!stored) return false;
  const byUser = await sha256(`${profile.username}:${password}`);
  const byEmail = await sha256(`${profile.email}:${password}`);
  return stored === byUser || stored === byEmail;
}

export const localApi = {
  load,
  ensurePasswordScheme,

  async signIn(identifier: string, password: string): Promise<Profile> {
    await ensurePasswordScheme();
    const store = load();
    const key = identifier.trim().toLowerCase();
    const matches = store.profiles.filter(
      (p) =>
        p.username.toLowerCase() === key ||
        p.email.toLowerCase() === key ||
        p.display_name.trim().toLowerCase() === key,
    );
    if (matches.length === 0) {
      throw new Error("找不到這個帳號。請填人員表上的「帳號」或 EMAIL，例如 lay 或 lay_zhang。");
    }
    for (const profile of matches) {
      if (await passwordMatches(store, profile, password)) {
        store.sessionUserId = profile.id;
        save(store);
        return profile;
      }
    }
    throw new Error("密碼不正確。預設密碼是 123456，請管理員到人員頁按「重設為 123456」。");
  },

  signOut() {
    const store = load();
    store.sessionUserId = null;
    save(store);
  },

  currentUser(): Profile | null {
    const store = load();
    return store.profiles.find((p) => p.id === store.sessionUserId) ?? null;
  },

  listProfiles(): Profile[] {
    return load().profiles;
  },

  listProjects(): Project[] {
    const store = load();
    const me = store.sessionUserId;
    const user = store.profiles.find((p) => p.id === me);
    if (user?.is_admin) return store.projects;
    const ids = new Set(store.members.filter((m) => m.user_id === me).map((m) => m.project_id));
    return store.projects.filter((p) => ids.has(p.id));
  },

  createProject(name: string, description: string): Project {
    const store = load();
    if (!store.sessionUserId) throw new Error("尚未登入");
    const project: Project = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      created_by: store.sessionUserId,
      created_at: new Date().toISOString(),
    };
    store.projects.push(project);
    store.members.push({
      project_id: project.id,
      user_id: store.sessionUserId,
      role: "leader",
    });
    save(store);
    return project;
  },

  listLeaderProjectIds(): string[] {
    const store = load();
    const me = store.sessionUserId;
    const user = store.profiles.find((p) => p.id === me);
    if (user?.is_admin) return store.projects.map((p) => p.id);
    return store.members.filter((m) => m.user_id === me && m.role === "leader").map((m) => m.project_id);
  },

  deleteProject(id: string) {
    if (localApi.myRole(id) !== "leader") {
      throw new Error("只有專案領導或管理員可以刪除專案");
    }
    const store = load();
    store.tasks = store.tasks.filter((t) => t.project_id !== id);
    store.members = store.members.filter((m) => m.project_id !== id);
    store.projects = store.projects.filter((p) => p.id !== id);
    save(store);
  },

  listMembers(projectId: string): ProjectMember[] {
    return load().members.filter((m) => m.project_id === projectId);
  },

  myRole(projectId: string): "leader" | "member" | null {
    const store = load();
    const user = store.profiles.find((p) => p.id === store.sessionUserId);
    if (user?.is_admin) return "leader";
    return (
      store.members.find(
        (m) => m.project_id === projectId && m.user_id === store.sessionUserId,
      )?.role ?? null
    );
  },

  async createAccounts(rows: AccountInput[]): Promise<CredentialRow[]> {
    const store = load();
    if (!store.sessionUserId) throw new Error("尚未登入");
    const me = store.profiles.find((p) => p.id === store.sessionUserId);
    const canCreate =
      Boolean(me?.is_admin) ||
      store.members.some((m) => m.user_id === store.sessionUserId && m.role === "leader");
    if (!canCreate) throw new Error("只有專案領導或管理員可以開通帳號");

    const creds: CredentialRow[] = [];
    const taken = new Set(store.profiles.map((p) => p.username.toLowerCase()));

    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      if (!email || !row.display_name.trim()) continue;
      const existing = store.profiles.find((p) => p.email.toLowerCase() === email);
      if (existing) {
        creds.push({
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
      const id = crypto.randomUUID();
      store.profiles.push({
        id,
        username,
        display_name: row.display_name.trim(),
        unit: row.unit.trim(),
        email,
        is_admin: false,
      });
      store.passwordHashes[id] = await sha256(`${username}:${password}`);
      creds.push({
        display_name: row.display_name.trim(),
        username,
        email,
        password,
      });
    }
    save(store);
    return creds;
  },

  async changePassword(current: string, next: string) {
    const store = load();
    const me = store.profiles.find((p) => p.id === store.sessionUserId);
    if (!me) throw new Error("尚未登入");
    const nextPassword = next.trim();
    if (nextPassword.length < 6) throw new Error("新密碼至少 6 碼");
    const currentHash = await sha256(`${me.username}:${current}`);
    const currentByEmail = await sha256(`${me.email}:${current}`);
    const stored = store.passwordHashes[me.id];
    if (stored !== currentHash && stored !== currentByEmail) {
      throw new Error("目前密碼不正確");
    }
    store.passwordHashes[me.id] = await sha256(`${me.username}:${nextPassword}`);
    save(store);
  },

  async resetPassword(userId: string) {
    const store = load();
    const me = store.profiles.find((p) => p.id === store.sessionUserId);
    if (!me) throw new Error("尚未登入");
    const target = store.profiles.find((p) => p.id === userId);
    if (!target) throw new Error("找不到這位人員");
    if (target.is_admin && !me.is_admin) throw new Error("不能重設管理員密碼");
    const canReset =
      Boolean(me.is_admin) ||
      store.members.some(
        (m) =>
          m.user_id === me.id &&
          m.role === "leader" &&
          store.members.some((other) => other.project_id === m.project_id && other.user_id === userId),
      );
    if (!canReset) throw new Error("只有專案領導或管理員可以重設密碼");
    store.passwordHashes[userId] = await sha256(`${target.username}:${DEFAULT_PASSWORD}`);
    save(store);
  },

  deletePerson(userId: string) {
    const store = load();
    const me = store.profiles.find((p) => p.id === store.sessionUserId);
    if (!me) throw new Error("尚未登入");
    const target = store.profiles.find((p) => p.id === userId);
    if (!target) throw new Error("找不到這位人員");
    if (target.id === me.id) throw new Error("不能刪除自己");
    if (target.is_admin) throw new Error("不能刪除管理員");
    const canDelete =
      Boolean(me.is_admin) ||
      store.members.some((m) => m.user_id === me.id && m.role === "leader");
    if (!canDelete) throw new Error("只有專案領導或管理員可以刪除人員");
    store.tasks.forEach((task) => {
      if (task.assignee_id === userId) task.assignee_id = null;
    });
    store.members = store.members.filter((m) => m.user_id !== userId);
    store.profiles = store.profiles.filter((p) => p.id !== userId);
    delete store.passwordHashes[userId];
    save(store);
  },

  addProjectMember(projectId: string, userId: string, role: Role): ProjectMember {
    const store = load();
    if (localApi.myRole(projectId) !== "leader") {
      throw new Error("只有專案領導或管理員可以把人加入專案");
    }
    const profile = store.profiles.find((p) => p.id === userId);
    if (!profile) throw new Error("找不到這位人員");
    const existing = store.members.find((m) => m.project_id === projectId && m.user_id === userId);
    if (existing) {
      existing.role = role;
      save(store);
      return existing;
    }
    const member: ProjectMember = { project_id: projectId, user_id: userId, role };
    store.members.push(member);
    save(store);
    return member;
  },

  async inviteMembers(rows: InviteInput[]): Promise<CredentialRow[]> {
    const store = load();
    if (!store.sessionUserId) throw new Error("尚未登入");
    const creds: CredentialRow[] = [];
    const taken = new Set(store.profiles.map((p) => p.username.toLowerCase()));

    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      if (!email || !row.display_name.trim()) continue;
      const project = store.projects.find((p) => p.id === row.project_id);
      if (!project) throw new Error("找不到專案");
      const role = localApi.myRole(row.project_id);
      if (role !== "leader") throw new Error("只有專案領導或管理員可以加人");

      let profile = store.profiles.find((p) => p.email.toLowerCase() === email);
      let password = "";
      let username = profile?.username ?? "";

      if (!profile) {
        username = usernameFromEmail(email, taken);
        taken.add(username);
        password = DEFAULT_PASSWORD;
        const id = crypto.randomUUID();
        profile = {
          id,
          username,
          display_name: row.display_name.trim(),
          unit: row.unit.trim(),
          email,
          is_admin: false,
        };
        store.profiles.push(profile);
        store.passwordHashes[id] = await sha256(`${username}:${password}`);
      }

      const existing = store.members.find(
        (m) => m.project_id === row.project_id && m.user_id === profile.id,
      );
      if (existing) existing.role = row.role;
      else store.members.push({ project_id: row.project_id, user_id: profile.id, role: row.role });

      creds.push({
        display_name: profile.display_name,
        username: profile.username,
        email: profile.email,
        password: password || "(已有帳號，沿用原密碼)",
        project_name: project.name,
        role: row.role,
      });
    }
    save(store);
    return creds;
  },

  listTasks(projectId: string): Task[] {
    return load()
      .tasks.filter((t) => t.project_id === projectId)
      .map((t) => ({ ...t, note: t.note ?? "" }));
  },

  createTask(input: Omit<Task, "id">): Task {
    const store = load();
    const task: Task = { ...input, id: crypto.randomUUID() };
    store.tasks.push(task);
    save(store);
    return task;
  },

  updateTask(id: string, patch: Partial<Task>): Task {
    const store = load();
    const task = store.tasks.find((t) => t.id === id);
    if (!task) throw new Error("找不到任務");
    Object.assign(task, patch);
    save(store);
    return task;
  },

  deleteTask(id: string) {
    const store = load();
    store.tasks = store.tasks.filter((t) => t.id !== id);
    save(store);
  },

  allTasks(): Task[] {
    const store = load();
    const visible = new Set(localApi.listProjects().map((project) => project.id));
    return store.tasks
      .filter((task) => visible.has(task.project_id))
      .map((task) => ({ ...task, note: task.note ?? "" }));
  },
};

export function ensureSampleIfEmpty() {
  const store = load();
  if (store.projects.length > 0) return;
  const project: Project = {
    id: crypto.randomUUID(),
    name: "工作基地",
    description: "預設專案，可改名或再新增。",
    created_by: ADMIN_ID,
    created_at: new Date().toISOString(),
  };
  store.projects.push(project);
  store.members.push({ project_id: project.id, user_id: ADMIN_ID, role: "leader" });
  const start = todayISO();
  store.tasks.push({
    id: crypto.randomUUID(),
    project_id: project.id,
    title: "整理人員名單",
    assignee_id: ADMIN_ID,
    start_date: start,
    due_date: start,
    status: "doing",
    note: "",
  });
  save(store);
}
