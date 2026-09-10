import { cloudApi } from "./cloudApi";
import { ensureSampleIfEmpty, localApi } from "./localApi";
import { hasSupabaseConfig } from "./util";
import type { InviteInput, Profile, Project, ProjectMember, Role, Task } from "./types";

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
    return localApi.currentUser();
  },
  async listProfiles(): Promise<Profile[]> {
    if (hasSupabaseConfig()) return cloudApi.listProfiles();
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
  async listMembers(projectId: string): Promise<ProjectMember[]> {
    if (hasSupabaseConfig()) return cloudApi.listMembers(projectId);
    return localApi.listMembers(projectId);
  },
  async myRole(projectId: string): Promise<Role | null> {
    if (hasSupabaseConfig()) return cloudApi.myRole(projectId);
    return localApi.myRole(projectId);
  },
  async inviteMembers(rows: InviteInput[]) {
    if (hasSupabaseConfig()) return cloudApi.inviteMembers(rows);
    return localApi.inviteMembers(rows);
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
