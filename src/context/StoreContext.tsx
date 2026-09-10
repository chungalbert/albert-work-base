import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Profile, Project, ProjectMember, Role, Task } from "../lib/types";
import { useAuth } from "./AuthContext";

interface StoreValue {
  projects: Project[];
  profiles: Profile[];
  members: ProjectMember[];
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    const [nextProjects, nextProfiles] = await Promise.all([
      api.listProjects(),
      api.listProfiles(),
    ]);
    setProjects(nextProjects);
    setProfiles(nextProfiles);
    const selected = projectId && nextProjects.some((p) => p.id === projectId)
      ? projectId
      : nextProjects[0]?.id ?? null;
    if (selected !== projectId) setProjectId(selected);
    if (selected) {
      const [nextMembers, nextTasks] = await Promise.all([
        api.listMembers(selected),
        api.listTasks(selected),
      ]);
      setMembers(nextMembers);
      setTasks(nextTasks);
    } else {
      setMembers([]);
      setTasks([]);
    }
  }, [user, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const role = user?.is_admin
    ? "leader"
    : members.find((m) => m.user_id === user?.id)?.role ?? null;

  const value = useMemo<StoreValue>(
    () => ({
      projects,
      profiles,
      members,
      tasks,
      projectId,
      project,
      role,
      setProjectId,
      reload,
    }),
    [projects, profiles, members, tasks, projectId, project, role, reload],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreProvider missing");
  return ctx;
}
