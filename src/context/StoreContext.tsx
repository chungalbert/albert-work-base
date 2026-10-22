import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { ALL_PROJECTS_ID, isAllProjects } from "../lib/projects";
import type { Profile, Project, ProjectMember, Role, Task } from "../lib/types";
import { useAuth } from "./AuthContext";

export type ReloadOptions = {
  /**
   * When true, an empty projects payload may replace a non-empty list
   * (e.g. after deleting the last project). Default false so a transient
   * Neon/RLS empty response after Save does not wipe the UI.
   */
  allowEmpty?: boolean;
};

interface StoreValue {
  projects: Project[];
  profiles: Profile[];
  members: ProjectMember[];
  allMembers: ProjectMember[];
  allTasks: Task[];
  tasks: Task[];
  projectId: string | null;
  project: Project | null;
  isAll: boolean;
  role: Role | null;
  leaderProjectIds: string[];
  /** True only until the first projects fetch settles (success or error). */
  initialLoading: boolean;
  loadError: string;
  setProjectId: (id: string) => void;
  projectName: (id: string) => string;
  canLeadProject: (id: string) => boolean;
  /** Optimistic in-place project updates (e.g. Admin edit Save) without clearing the list. */
  patchProjectsLocal: (updater: (prev: Project[]) => Project[]) => void;
  reload: (options?: ReloadOptions) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allMembers, setAllMembers] = useState<ProjectMember[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [leaderProjectIds, setLeaderProjectIds] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const hasLoadedOnce = useRef(false);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const reloadGen = useRef(0);

  const patchProjectsLocal = useCallback((updater: (prev: Project[]) => Project[]) => {
    setProjects((prev) => updater(prev));
  }, []);

  const reload = useCallback(async (options?: ReloadOptions) => {
    if (!userId) {
      setInitialLoading(false);
      return;
    }
    // Post-boot reloads (Save/Cancel/edit) must not flip PageLoadingGate / cold-start empty.
    if (!hasLoadedOnce.current) setInitialLoading(true);
    const gen = ++reloadGen.current;
    try {
      const [nextProjects, nextProfiles, nextAllTasks, nextLeaderIds, nextAllMembers] = await Promise.all([
        api.listProjects(),
        api.listProfiles(),
        api.allTasks(),
        api.listLeaderProjectIds(),
        api.listAllMembers(),
      ]);
      if (gen !== reloadGen.current) return;

      const prev = projectsRef.current;
      const retainPrior =
        nextProjects.length === 0 &&
        prev.length > 0 &&
        hasLoadedOnce.current &&
        !options?.allowEmpty;
      const resolvedProjects = retainPrior ? prev : nextProjects;

      const visible = new Set(resolvedProjects.map((project) => project.id));
      setProjects(resolvedProjects);
      setProfiles(nextProfiles);
      setAllTasks(nextAllTasks.filter((task) => visible.has(task.project_id)));
      setLeaderProjectIds(nextLeaderIds);
      setAllMembers(nextAllMembers.filter((member) => visible.has(member.project_id)));
      const current = projectIdRef.current;
      const selected =
        current === ALL_PROJECTS_ID
          ? ALL_PROJECTS_ID
          : current && visible.has(current)
            ? current
            : resolvedProjects[0]?.id ?? null;
      if (selected !== current) setProjectId(selected);
      setLoadError("");
    } catch (err) {
      if (gen !== reloadGen.current) return;
      // Keep existing projects on failure — never blank the list for a reload error.
      setLoadError(err instanceof Error ? err.message : "載入專案失敗");
    } finally {
      if (gen === reloadGen.current) {
        hasLoadedOnce.current = true;
        setInitialLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    hasLoadedOnce.current = false;
    reloadGen.current += 1;
    if (!userId) {
      setProjects([]);
      setProfiles([]);
      setAllMembers([]);
      setAllTasks([]);
      setLeaderProjectIds([]);
      setProjectId(null);
      setInitialLoading(false);
      setLoadError("");
      return;
    }
    setInitialLoading(true);
    void reload();
  }, [reload, userId]);

  const isAll = isAllProjects(projectId);
  const project = isAll ? null : projects.find((item) => item.id === projectId) ?? null;
  const members = useMemo(
    () => (projectId && !isAll ? allMembers.filter((member) => member.project_id === projectId) : []),
    [allMembers, projectId, isAll],
  );
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
      allMembers,
      allTasks,
      tasks,
      projectId,
      project,
      isAll,
      role,
      leaderProjectIds,
      initialLoading,
      loadError,
      setProjectId,
      projectName,
      canLeadProject,
      patchProjectsLocal,
      reload,
    }),
    [
      projects,
      profiles,
      members,
      allMembers,
      allTasks,
      tasks,
      projectId,
      project,
      isAll,
      role,
      leaderProjectIds,
      initialLoading,
      loadError,
      projectName,
      canLeadProject,
      patchProjectsLocal,
      reload,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("StoreProvider missing");
  return ctx;
}
