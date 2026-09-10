import { todayISO } from "./dates";
import type {
  CredentialRow,
  InviteInput,
  Profile,
  Project,
  ProjectMember,
  Task,
} from "./types";
import { randomPassword, sha256, usernameFromEmail } from "./util";

const KEY = "awb-store-v1";
const ADMIN_HASH = "4dcaa92c01008dd30fa65408b02c8b400a00e6c6f20065fbf3be39c908c4ed20";

interface Store {
  sessionUserId: string | null;
  profiles: Profile[];
  passwordHashes: Record<string, string>;
  projects: Project[];
  members: ProjectMember[];
  tasks: Task[];
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

export const localApi = {
  load,

  async signIn(identifier: string, password: string): Promise<Profile> {
    const store = load();
    const key = identifier.trim().toLowerCase();
    const profile = store.profiles.find(
      (p) => p.username.toLowerCase() === key || p.email.toLowerCase() === key,
    );
    if (!profile) throw new Error("帳號或密碼不正確。");
    const hash = await sha256(`${profile.username}:${password}`);
    const alt = await sha256(`${identifier.trim()}:${password}`);
    if (store.passwordHashes[profile.id] !== hash && store.passwordHashes[profile.id] !== alt) {
      throw new Error("帳號或密碼不正確。");
    }
    store.sessionUserId = profile.id;
    save(store);
    return profile;
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
        password = randomPassword();
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
