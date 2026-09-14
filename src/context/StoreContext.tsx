import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { ALL_PROJECTS_ID, isAllProjects } from "../lib/projects";
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
  isAll: boolean;
  role: Role | null;
  leaderProjectIds: string[];
  setProjectId: (id: string) => void;
  projectName: (id: string) => string;
  canLeadProject: (id: string) => boolean;
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
  const [leaderProjectIds, setLeaderProjectIds] = useState<string[]>([]);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const reload = useCallback(async () => {
    if (!user) return;
    const [nextProjects, nextProfiles, nextAllTasks, nextLeaderIds] = await Promise.all([
      api.listProjects(),
      api.listProfiles(),
      api.allTasks(),
      api.listLeaderProjectIds(),
    ]);
    const visible = new Set(nextProjects.map((project) => project.id));
    setProjects(nextProjects);
    setProfiles(nextProfiles);
    setAllTasks(nextAllTasks.filter((task) => visible.has(task.project_id)));
    setLeaderProjectIds(nextLeaderIds);
    const current = projectIdRef.current;
    const selected =
      current === ALL_PROJECTS_ID
        ? ALL_PROJECTS_ID
        : current && visible.has(current)
          ? current
          : nextProjects[0]?.id ?? null;
    if (selected !== current) setProjectId(selected);
    if (selected && !isAllProjects(selected)) setMembers(await api.listMembers(selected));
    else setMembers([]);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!user || !projectId || isAllProjects(projectId)) {
      setMembers([]);
      return;
    }
    void api.listMembers(projectId).then(setMembers);
  }, [user, projectId]);

  const isAll = isAllProjects(projectId);
  const project = isAll ? null : projects.find((item) => item.id === projectId) ?? null;
  const canLeadProject = useCallback(
    (id: string) => Boolean(user?.is_admin || leaderProjectIds.includes(id)),
    [user, leaderProjectIds],
  );
  const projectName = useCallback(
    (id: string) => projects.find((item) => item.id === id)?.name ?? "專案",
    [projects],
  );

  const tasks = useMemo(() => {
    if (!user) return [];
    const visible = allTasks.filter((task) => {
      if (user.is_admin) return true;
      if (leaderProjectIds.includes(task.project_id)) return true;
      return task.assignee_id === user.id;
    });
    const scoped = isAll ? visible : visible.filter((task) => task.project_id === projectId);
    return [...scoped].sort((a, b) => {
      const byProject = projectName(a.project_id).localeCompare(projectName(b.project_id), "zh-Hant");
      if (byProject !== 0) return byProject;
      return a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title, "zh-Hant");
    });
  }, [allTasks, user, leaderProjectIds, isAll, projectId, projectName]);

  const role: Role | null = user?.is_admin
    ? "leader"
    : isAll
      ? (leaderProjectIds.length > 0 ? "leader" : "member")
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
      isAll,
      role,
      leaderProjectIds,
      setProjectId,
      projectName,
      canLeadProject,
      reload,
    }),
    [projects, profiles, members, allTasks, tasks, projectId, project, isAll, role, leaderProjectIds, projectName, canLeadProject, reload],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreProvider missing");
  return ctx;
}
