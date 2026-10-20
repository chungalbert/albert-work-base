import { cloudApi } from "./cloudApi";
import { ensureSampleIfEmpty, localApi } from "./localApi";
import { importColumnsIfEmpty, personnelUiStore } from "./personnelUiStore";
import { projectsUiStore, type ProjectFieldPatch } from "./projectsUiStore";
import { hasSupabaseConfig } from "./util";
import {
  normalizePersonnelRole,
  type AccountInput,
  type CreatePersonnelInput,
  type InviteInput,
  type PersonnelColumn,
  type PersonnelRole,
  type Profile,
  type Project,
  type ProjectColumn,
  type ProjectMember,
  type Role,
  type Task,
} from "./types";

export const isCloud = hasSupabaseConfig;

function withPersonnelOverlay(profile: Profile): Profile {
  return personnelUiStore.mergeProfile(profile);
}

function withProjectOverlay(project: Project): Project {
  return projectsUiStore.mergeProject(project);
}

function mergeProfilesWithExtras(profiles: Profile[]): Profile[] {
  const byId = new Map(profiles.map((p) => [p.id, withPersonnelOverlay(p)]));
  for (const extra of personnelUiStore.listExtraMembers()) {
    if (!byId.has(extra.id) && ![...byId.values()].some((p) => p.email.toLowerCase() === extra.email.toLowerCase())) {
      byId.set(extra.id, extra);
    }
  }
  return [...byId.values()];
}

function mergeMembersWithExtras(members: ProjectMember[]): ProjectMember[] {
  const keys = new Set(members.map((m) => `${m.project_id}:${m.user_id}`));
  const merged = [...members];
  for (const row of personnelUiStore.listExtraMemberships()) {
    const key = `${row.project_id}:${row.user_id}`;
    if (!keys.has(key)) {
      keys.add(key);
      merged.push(row);
    }
  }
  return merged;
}

export const api = {
  async signIn(identifier: string, password: string): Promise<Profile> {
    if (hasSupabaseConfig()) return withPersonnelOverlay(await cloudApi.signIn(identifier, password));
    const profile = await localApi.signIn(identifier, password);
    ensureSampleIfEmpty();
    return withPersonnelOverlay(profile);
  },
  async signOut() {
    if (hasSupabaseConfig()) return cloudApi.signOut();
    localApi.signOut();
  },
  async currentUser(): Promise<Profile | null> {
    if (hasSupabaseConfig()) {
      const profile = await cloudApi.currentUser();
      return profile ? withPersonnelOverlay(profile) : null;
    }
    await localApi.ensurePasswordScheme();
    const profile = localApi.currentUser();
    return profile ? withPersonnelOverlay(profile) : null;
  },
  async listProfiles(): Promise<Profile[]> {
    if (hasSupabaseConfig()) {
      const profiles = await cloudApi.listProfiles();
      return mergeProfilesWithExtras(profiles);
    }
    await localApi.ensurePasswordScheme();
    importColumnsIfEmpty(localApi.listPersonnelColumns());
    return mergeProfilesWithExtras(localApi.listProfiles());
  },
  async listProjects(): Promise<Project[]> {
    if (hasSupabaseConfig()) {
      return (await cloudApi.listProjects()).map(withProjectOverlay);
    }
    return localApi.listProjects().map(withProjectOverlay);
  },
  async createProject(name: string, description: string): Promise<Project> {
    if (hasSupabaseConfig()) return withProjectOverlay(await cloudApi.createProject(name, description));
    return withProjectOverlay(localApi.createProject(name, description));
  },
  async updateProject(projectId: string, patch: ProjectFieldPatch): Promise<Project> {
    if (!hasSupabaseConfig()) {
      return withProjectOverlay(localApi.updateProject(projectId, patch));
    }
    const projects = await cloudApi.listProjects();
    const base = projects.find((p) => p.id === projectId);
    if (!base) throw new Error("找不到專案");
    return projectsUiStore.applyOverlay(projectId, base, patch);
  },
  async listProjectColumns(): Promise<ProjectColumn[]> {
    return projectsUiStore.listColumns();
  },
  async addProjectColumn(label: string): Promise<ProjectColumn> {
    return projectsUiStore.addColumn(label);
  },
  async removeProjectColumn(columnId: string) {
    projectsUiStore.removeColumn(columnId);
  },
  async listLeaderProjectIds(): Promise<string[]> {
    if (hasSupabaseConfig()) return cloudApi.listLeaderProjectIds();
    return localApi.listLeaderProjectIds();
  },
  async deleteProject(id: string) {
    if (hasSupabaseConfig()) return cloudApi.deleteProject(id);
    localApi.deleteProject(id);
  },
  async listMembers(projectId: string): Promise<ProjectMember[]> {
    if (hasSupabaseConfig()) {
      return mergeMembersWithExtras(await cloudApi.listMembers(projectId)).filter(
        (m) => m.project_id === projectId,
      );
    }
    return mergeMembersWithExtras(localApi.listMembers(projectId)).filter(
      (m) => m.project_id === projectId,
    );
  },
  async listAllMembers(): Promise<ProjectMember[]> {
    if (hasSupabaseConfig()) return mergeMembersWithExtras(await cloudApi.listAllMembers());
    return mergeMembersWithExtras(localApi.listAllMembers());
  },
  async myRole(projectId: string): Promise<Role | null> {
    if (hasSupabaseConfig()) return cloudApi.myRole(projectId);
    return localApi.myRole(projectId);
  },
  async createAccounts(rows: AccountInput[]) {
    if (hasSupabaseConfig()) return cloudApi.createAccounts(rows);
    return localApi.createAccounts(rows);
  },
  async addProjectMember(projectId: string, userId: string, role: Role) {
    if (hasSupabaseConfig()) return cloudApi.addProjectMember(projectId, userId, role);
    return localApi.addProjectMember(projectId, userId, role);
  },
  async removeProjectMember(projectId: string, userId: string) {
    if (hasSupabaseConfig()) return cloudApi.removeProjectMember(projectId, userId);
    localApi.removeProjectMember(projectId, userId);
  },
  async inviteMembers(rows: InviteInput[]) {
    if (hasSupabaseConfig()) return cloudApi.inviteMembers(rows);
    return localApi.inviteMembers(rows);
  },
  async changePassword(current: string, next: string) {
    if (hasSupabaseConfig()) return cloudApi.changePassword(current, next);
    return localApi.changePassword(current, next);
  },
  async resetPassword(userId: string) {
    if (hasSupabaseConfig()) return cloudApi.resetPassword(userId);
    return localApi.resetPassword(userId);
  },
  async deletePerson(userId: string) {
    const extras = personnelUiStore.listExtraMembers();
    if (extras.some((p) => p.id === userId)) {
      personnelUiStore.removeExtraMember(userId);
      return;
    }
    if (hasSupabaseConfig()) return cloudApi.deletePerson(userId);
    localApi.deletePerson(userId);
  },
  async createPersonnelMember(input: CreatePersonnelInput): Promise<Profile> {
    const me = await api.currentUser();
    if (!me || normalizePersonnelRole(me) !== "Admin") {
      throw new Error("只有 Admin 可以新增 Member");
    }
    const display_name = input.display_name.trim();
    if (!display_name) throw new Error("姓名不能空白");
    const personnel_role = input.personnel_role;
    const projectIds = [...new Set(input.projectIds ?? [])];
    const phone = (input.phone ?? "").trim();
    let email = (input.email ?? "").trim().toLowerCase();
    const username = (input.username ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!email && username) email = `${username}@local`;
    if (!email) throw new Error("請填寫帳號或 EMAIL");

    if (!hasSupabaseConfig()) {
      const created = await localApi.createPersonnelMember({
        display_name,
        username: username || undefined,
        email,
        phone,
        personnel_role,
        projectIds,
      });
      return withPersonnelOverlay(created);
    }

    // Cloud: try invite edge function; on failure, persist as client-side extra member.
    try {
      const creds = await cloudApi.createAccounts([
        { display_name, unit: phone, email },
      ]);
      const cred = creds[0];
      const profiles = await cloudApi.listProfiles();
      let profile =
        profiles.find((p) => p.email.toLowerCase() === email) ??
        (cred ? profiles.find((p) => p.username === cred.username) : undefined);
      if (!profile) throw new Error("帳號已建立，但找不到人員資料");
      profile = personnelUiStore.applyOverlay(profile.id, profile, {
        display_name,
        unit: phone,
        email,
        personnel_role,
        projectIds,
      });
      if (projectIds.length > 0) {
        await api.setPersonProjects(profile.id, projectIds);
      }
      return withPersonnelOverlay(profile);
    } catch {
      const id = crypto.randomUUID();
      const login =
        username ||
        email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24) ||
        "user";
      return personnelUiStore.addExtraMember(
        {
          id,
          username: login,
          display_name,
          unit: phone,
          email,
          is_admin: personnel_role === "Admin",
          personnel_role,
          custom: {},
        },
        projectIds,
      );
    }
  },
  async listPersonnelColumns(): Promise<PersonnelColumn[]> {
    if (!hasSupabaseConfig()) {
      importColumnsIfEmpty(localApi.listPersonnelColumns());
    }
    return personnelUiStore.listColumns();
  },
  async addPersonnelColumn(label: string): Promise<PersonnelColumn> {
    // Client-side persistence for both local and Supabase (cloud) modes.
    return personnelUiStore.addColumn(label);
  },
  async removePersonnelColumn(columnId: string) {
    personnelUiStore.removeColumn(columnId);
  },
  async updateProfile(
    userId: string,
    patch: {
      display_name?: string;
      unit?: string;
      email?: string;
      personnel_role?: PersonnelRole;
      custom?: Record<string, string>;
    },
  ): Promise<Profile> {
    const extra = personnelUiStore.listExtraMembers().find((p) => p.id === userId);
    if (extra) {
      return personnelUiStore.applyOverlay(userId, extra, patch);
    }
    if (!hasSupabaseConfig()) {
      const updated = localApi.updateProfile(userId, patch);
      return withPersonnelOverlay(updated);
    }
    const profiles = await cloudApi.listProfiles();
    const base = profiles.find((p) => p.id === userId);
    if (!base) throw new Error("找不到這位人員");
    return personnelUiStore.applyOverlay(userId, base, patch);
  },
  async setPersonProjects(userId: string, projectIds: string[]) {
    if (personnelUiStore.listExtraMembers().some((p) => p.id === userId)) {
      personnelUiStore.setExtraProjectIds(userId, projectIds);
      return;
    }
    if (!hasSupabaseConfig()) {
      localApi.setPersonProjects(userId, projectIds);
      return;
    }
    // Cloud: sync memberships via existing member APIs (member role by default).
    const current = (await cloudApi.listAllMembers()).filter((m) => m.user_id === userId);
    const wanted = new Set(projectIds);
    for (const m of current) {
      if (!wanted.has(m.project_id)) {
        await cloudApi.removeProjectMember(m.project_id, userId);
      }
    }
    for (const projectId of wanted) {
      if (!current.some((m) => m.project_id === projectId)) {
        await cloudApi.addProjectMember(projectId, userId, "member");
      }
    }
  },
  async listTasks(projectId: string): Promise<Task[]> {
    if (hasSupabaseConfig()) return cloudApi.listTasks(projectId);
    return localApi.listTasks(projectId);
  },
  async createTask(input: Omit<Task, "id">): Promise<Task> {
    if (hasSupabaseConfig()) return cloudApi.createTask(input);
    return localApi.createTask(input);
  },
  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    if (hasSupabaseConfig()) return cloudApi.updateTask(id, patch);
    return localApi.updateTask(id, patch);
  },
  async deleteTask(id: string) {
    if (hasSupabaseConfig()) return cloudApi.deleteTask(id);
    localApi.deleteTask(id);
  },
  async allTasks(): Promise<Task[]> {
    if (hasSupabaseConfig()) return cloudApi.allTasksForUser();
    return localApi.allTasks();
  },
  async bootstrapAdmin(username: string, password: string, email: string) {
    if (!hasSupabaseConfig()) throw new Error("本機模式不需建立雲端管理員");
    return cloudApi.bootstrapAdmin(username, password, email);
  },
};
