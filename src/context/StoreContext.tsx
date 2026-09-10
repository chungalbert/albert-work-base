import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Profile, Project, ProjectMember, Role, Task } from "../lib/types";
import { useAuth } from "./AuthContext";

interface StoreValue {
  projects: Project[];
  profiles: Profile[];
  members: ProjectMember[];
  allTasks: Task[];
  tasks: Task[];
  projectId: string | null;
  project: Project | null;
  role: Role | null;
  setProjectId: (id: string) => void;
  reload: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    const [nextProjects, nextProfiles, nextAllTasks] = await Promise.all([
      api.listProjects(),
      api.listProfiles(),
      api.allTasks(),
    ]);
    const visible = new Set(nextProjects.map((project) => project.id));
    setProjects(nextProjects);
    setProfiles(nextProfiles);
    setAllTasks(nextAllTasks.filter((task) => visible.has(task.project_id)));
    setProjectId((current) =>
      current && visible.has(current) ? current : nextProjects[0]?.id ?? null,
    );
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!user || !projectId) {
      setMembers([]);
      return;
    }
    void api.listMembers(projectId).then(setMembers);
  }, [user, projectId]);

  const project = projects.find((item) => item.id === projectId) ?? null;
  const tasks = useMemo(
    () => allTasks.filter((task) => task.project_id === projectId),
    [allTasks, projectId],
  );
  const role = user?.is_admin
    ? "leader"
    : members.find((member) => member.user_id === user?.id)?.role ?? null;

  const value = useMemo<StoreValue>(
    () => ({
      projects,
      profiles,
      members,
      allTasks,
      tasks,
      projectId,
      project,
      role,
      setProjectId,
      reload,
    }),
    [projects, profiles, members, allTasks, tasks, projectId, project, role, reload],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreProvider missing");
  return ctx;
}
