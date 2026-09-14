export const ALL_PROJECTS_ID = "all";

export function isAllProjects(projectId: string | null | undefined): boolean {
  return projectId === ALL_PROJECTS_ID;
}
