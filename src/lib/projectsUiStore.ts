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
  { key: "owner", label: "OWNER" },
] as const;

export type ProjectBuiltinKey = (typeof PROJECT_BUILTIN_COLUMNS)[number]["key"];

const BUILTIN_LABELS = new Set(
  PROJECT_BUILTIN_COLUMNS.map((c) => c.label.trim().toUpperCase()),
);

/** Reserved header labels that must never get a remove × (builtins + ACTIONS). */
const RESERVED_HEADER_LABELS = new Set([...BUILTIN_LABELS, "ACTIONS"]);

function normalizeLabel(label: string): string {
  return label.trim().toUpperCase();
}

export function isReservedProjectColumnLabel(label: string): boolean {
  return RESERVED_HEADER_LABELS.has(normalizeLabel(label));
}

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
  owner?: string;
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

/**
 * Drop custom columns whose labels collide with builtins (e.g. OWNER added via +ADD COLUMN).
 * Migrate OWNER cell values into the builtin `owner` overlay field.
 */
function scrubReservedCustomColumns(state: ProjectsUiState): boolean {
  const reserved = state.columns.filter((c) => isReservedProjectColumnLabel(c.label));
  if (reserved.length === 0) return false;

  const ownerCols = reserved.filter((c) => normalizeLabel(c.label) === "OWNER");
  for (const col of ownerCols) {
    for (const overlay of Object.values(state.overlays)) {
      const fromCustom = overlay.custom?.[col.id];
      if (fromCustom != null && fromCustom !== "" && (overlay.owner == null || overlay.owner === "")) {
        overlay.owner = fromCustom;
      }
      if (overlay.custom && col.id in overlay.custom) {
        const next = { ...overlay.custom };
        delete next[col.id];
        overlay.custom = next;
      }
    }
  }

  for (const col of reserved) {
    if (normalizeLabel(col.label) === "OWNER") continue;
    for (const overlay of Object.values(state.overlays)) {
      if (overlay.custom && col.id in overlay.custom) {
        const next = { ...overlay.custom };
        delete next[col.id];
        overlay.custom = next;
      }
    }
  }

  const reservedIds = new Set(reserved.map((c) => c.id));
  state.columns = state.columns.filter((c) => !reservedIds.has(c.id));
  return true;
}

/** Snapshot for one-time local → Neon migrate (do not wipe cloud). */
export function readProjectsUiState(): ProjectsUiState {
  const state = load();
  if (scrubReservedCustomColumns(state)) save(state);
  return {
    columns: state.columns.map((c) => ({ ...c })),
    overlays: Object.fromEntries(
      Object.entries(state.overlays).map(([id, overlay]) => [id, { ...overlay, custom: { ...(overlay.custom ?? {}) } }]),
    ),
  };
}

/** After a successful cloud migrate, drop local column defs + overlays so Neon is source of truth. */
export function clearProjectsUiLocal() {
  save(empty());
}

/** Replace local UI state (used when migrate leaves unmigrated leftovers). */
export function replaceProjectsUiLocal(state: ProjectsUiState) {
  save({
    columns: Array.isArray(state.columns) ? state.columns.map((c) => ({ ...c })) : [],
    overlays:
      state.overlays && typeof state.overlays === "object"
        ? Object.fromEntries(
            Object.entries(state.overlays).map(([id, overlay]) => [
              id,
              { ...overlay, custom: { ...(overlay.custom ?? {}) } },
            ]),
          )
        : {},
  });
}

export const projectsUiStore = {
  listColumns(): ProjectColumn[] {
    const state = load();
    if (scrubReservedCustomColumns(state)) save(state);
    return [...state.columns];
  },

  addColumn(label: string): ProjectColumn {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("欄位名稱不能空白");
    if (isReservedProjectColumnLabel(trimmed)) {
      throw new Error(`「${trimmed}」是預設欄位，無法再新增`);
    }
    const state = load();
    scrubReservedCustomColumns(state);
    if (state.columns.some((c) => normalizeLabel(c.label) === normalizeLabel(trimmed))) {
      throw new Error("欄位名稱已存在");
    }
    const col: ProjectColumn = { id: crypto.randomUUID(), label: trimmed };
    state.columns.push(col);
    save(state);
    return col;
  },

  removeColumn(columnId: string) {
    const state = load();
    scrubReservedCustomColumns(state);
    const target = state.columns.find((c) => c.id === columnId);
    if (!target) return;
    if (isReservedProjectColumnLabel(target.label)) {
      throw new Error("預設欄位無法刪除");
    }
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
      owner: overlay.owner ?? project.owner ?? "",
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
    if (patch.owner !== undefined) next.owner = patch.owner.trim();
    if (patch.custom !== undefined) {
      next.custom = { ...(prev.custom ?? {}), ...patch.custom };
    }

    state.overlays[projectId] = next;
    save(state);
    return projectsUiStore.mergeProject({ ...base, ...next, custom: { ...(base.custom ?? {}), ...(next.custom ?? {}) } });
  },
};
