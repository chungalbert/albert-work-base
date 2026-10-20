import { cloudApi } from "./cloudApi";
import { ensureSampleIfEmpty, localApi } from "./localApi";
import { importColumnsIfEmpty, personnelUiStore } from "./personnelUiStore";
import { hasSupabaseConfig } from "./util";
import type {
  AccountInput,
  InviteInput,
  PersonnelColumn,
  PersonnelRole,
  Profile,
  Project,
  ProjectMember,
  Role,
  Task,
} from "./types";

export const isCloud = hasSupabaseConfig;

function withPersonnelOverlay(profile: Profile): Profile {
  return personnelUiStore.mergeProfile(profile);
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
      return profiles.map(withPersonnelOverlay);
    }
    await localApi.ensurePasswordScheme();
    importColumnsIfEmpty(localApi.listPersonnelColumns());
    return localApi.listProfiles().map(withPersonnelOverlay);
  },
  async listProjects(): Promise<Project[]> {
    if (hasSupabaseConfig()) return cloudApi.listProjects();
    return localApi.listProjects();
  },
  async createProject(name: string, description: string): Promise<Project> {
    if (hasSupabaseConfig()) return cloudApi.createProject(name, description);
    return localApi.createProject(name, description);
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
    if (hasSupabaseConfig()) return cloudApi.listMembers(projectId);
    return localApi.listMembers(projectId);
  },
  async listAllMembers(): Promise<ProjectMember[]> {
    if (hasSupabaseConfig()) return cloudApi.listAllMembers();
    return localApi.listAllMembers();
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
    if (hasSupabaseConfig()) return cloudApi.deletePerson(userId);
    localApi.deletePerson(userId);
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
