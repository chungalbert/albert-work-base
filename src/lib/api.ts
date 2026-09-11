import { cloudApi } from "./cloudApi";
import { ensureSampleIfEmpty, localApi } from "./localApi";
import { hasSupabaseConfig } from "./util";
import type { AccountInput, InviteInput, Profile, Project, ProjectMember, Role, Task } from "./types";

export const isCloud = hasSupabaseConfig;

export const api = {
  async signIn(identifier: string, password: string): Promise<Profile> {
    if (hasSupabaseConfig()) return cloudApi.signIn(identifier, password);
    const profile = await localApi.signIn(identifier, password);
    ensureSampleIfEmpty();
    return profile;
  },
  async signOut() {
    if (hasSupabaseConfig()) return cloudApi.signOut();
    localApi.signOut();
  },
  async currentUser(): Promise<Profile | null> {
    if (hasSupabaseConfig()) return cloudApi.currentUser();
    await localApi.ensurePasswordScheme();
    return localApi.currentUser();
  },
  async listProfiles(): Promise<Profile[]> {
    if (hasSupabaseConfig()) return cloudApi.listProfiles();
    await localApi.ensurePasswordScheme();
    return localApi.listProfiles();
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
