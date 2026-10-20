import type { Project, ProjectColumn } from "./types";

const KEY = "awb-projects-ui-v1";

export const PROJECT_BUILTIN_COLUMNS = [
  { key: "compal_name", label: "COMPAL PROJECT NAME" },
  { key: "lenovo_name", label: "LENOVO PROJECT NAME" },
  { key: "bios_id", label: "BIOS ID" },
  { key: "platform", label: "PLATFORM" },
  { key: "dis", label: "DIS" },
  { key: "ss_date", label: "SS DATE" },
  { key: "eol_date", label: "EOL DATE" },
  { key: "security_update", label: "SECURITY UPDATE" },
  { key: "talent_policy", label: "TALENT POLICY" },
] as const;

export type ProjectBuiltinKey = (typeof PROJECT_BUILTIN_COLUMNS)[number]["key"];

export type ProjectFieldPatch = {
  name?: string;
  description?: string;
  lenovo_name?: string;
  bios_id?: string;
  platform?: string;
  dis?: string;
  ss_date?: string;
  eol_date?: string;
  security_update?: string;
  talent_policy?: string;
  custom?: Record<string, string>;
};

interface ProjectOverlay extends ProjectFieldPatch {}

interface ProjectsUiState {
  columns: ProjectColumn[];
  overlays: Record<string, ProjectOverlay>;
}

function empty(): ProjectsUiState {
  return { columns: [], overlays: {} };
}

function load(): ProjectsUiState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as ProjectsUiState;
    return {
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
      overlays: parsed.overlays && typeof parsed.overlays === "object" ? parsed.overlays : {},
    };
  } catch {
    return empty();
  }
}

function save(state: ProjectsUiState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export const projectsUiStore = {
  listColumns(): ProjectColumn[] {
    return [...load().columns];
  },

  addColumn(label: string): ProjectColumn {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("欄位名稱不能空白");
    const state = load();
    const col: ProjectColumn = { id: crypto.randomUUID(), label: trimmed };
    state.columns.push(col);
    save(state);
    return col;
  },

  removeColumn(columnId: string) {
    const state = load();
    state.columns = state.columns.filter((c) => c.id !== columnId);
    for (const overlay of Object.values(state.overlays)) {
      if (overlay.custom && columnId in overlay.custom) {
        const next = { ...overlay.custom };
        delete next[columnId];
        overlay.custom = next;
      }
    }
    save(state);
  },

  mergeProject(project: Project): Project {
    const overlay = load().overlays[project.id] ?? {};
    return {
      ...project,
      name: overlay.name ?? project.name,
      description: overlay.description ?? project.description,
      lenovo_name: overlay.lenovo_name ?? project.lenovo_name ?? "",
      bios_id: overlay.bios_id ?? project.bios_id ?? "",
      platform: overlay.platform ?? project.platform ?? "",
      dis: overlay.dis ?? project.dis ?? "",
      ss_date: overlay.ss_date ?? project.ss_date ?? "",
      eol_date: overlay.eol_date ?? project.eol_date ?? "",
      security_update: overlay.security_update ?? project.security_update ?? "",
      talent_policy: overlay.talent_policy ?? project.talent_policy ?? "",
      custom: { ...(project.custom ?? {}), ...(overlay.custom ?? {}) },
    };
  },

  applyOverlay(projectId: string, base: Project, patch: ProjectFieldPatch): Project {
    const state = load();
    const prev = state.overlays[projectId] ?? {};
    const next: ProjectOverlay = { ...prev };

    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("專案名稱不能空白");
      next.name = name;
    }
    if (patch.description !== undefined) next.description = patch.description.trim();
    if (patch.lenovo_name !== undefined) next.lenovo_name = patch.lenovo_name.trim();
    if (patch.bios_id !== undefined) next.bios_id = patch.bios_id.trim();
    if (patch.platform !== undefined) next.platform = patch.platform.trim();
    if (patch.dis !== undefined) next.dis = patch.dis.trim();
    if (patch.ss_date !== undefined) next.ss_date = patch.ss_date.trim();
    if (patch.eol_date !== undefined) next.eol_date = patch.eol_date.trim();
    if (patch.security_update !== undefined) next.security_update = patch.security_update.trim();
    if (patch.talent_policy !== undefined) next.talent_policy = patch.talent_policy.trim();
    if (patch.custom !== undefined) {
      next.custom = { ...(prev.custom ?? {}), ...patch.custom };
    }

    state.overlays[projectId] = next;
    save(state);
    return projectsUiStore.mergeProject({ ...base, ...next, custom: { ...(base.custom ?? {}), ...(next.custom ?? {}) } });
  },
};
