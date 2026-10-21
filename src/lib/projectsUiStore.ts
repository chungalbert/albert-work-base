import type { Project, ProjectColumn } from "./types";

const KEY = "awb-projects-ui-v1";
const LOCAL_COLUMNS_SEEDED_KEY = "awb-projects-columns-seeded-v1";

/** Always-visible left column; not managed via Add/Remove column. */
export const PROJECT_LOCKED_COLUMN = {
  key: "compal_name",
  label: "COMPAL PROJECT NAME",
} as const;

/**
 * Former builtins that are now removable column defs.
 * Stable UUIDs so Neon `project_columns.id` and meta JSON stay aligned;
 * `key` maps to `projects.<key>` cell fields when the column is re-added.
 */
export const PROJECT_STANDARD_COLUMNS = [
  {
    key: "lenovo_name",
    label: "LENOVO PROJECT NAME",
    id: "00000000-0000-4000-8000-0000000000d1",
  },
  {
    key: "bios_id",
    label: "BIOS ID",
    id: "00000000-0000-4000-8000-0000000000d2",
  },
  {
    key: "platform",
    label: "PLATFORM",
    id: "00000000-0000-4000-8000-0000000000d3",
  },
  {
    key: "dis",
    label: "DIS",
    id: "00000000-0000-4000-8000-0000000000d4",
  },
  {
    key: "ss_date",
    label: "SS DATE",
    id: "00000000-0000-4000-8000-0000000000d5",
  },
  {
    key: "eol_date",
    label: "EOL DATE",
    id: "00000000-0000-4000-8000-0000000000d6",
  },
  {
    key: "security_update",
    label: "SECURITY UPDATE",
    id: "00000000-0000-4000-8000-0000000000d7",
  },
  {
    key: "talent_policy",
    label: "TALENT POLICY",
    id: "00000000-0000-4000-8000-0000000000d8",
  },
  {
    key: "owner",
    label: "OWNER",
    id: "00000000-0000-4000-8000-0000000000d9",
  },
] as const;

export type ProjectStandardKey = (typeof PROJECT_STANDARD_COLUMNS)[number]["key"];

/** @deprecated Prefer PROJECT_LOCKED_COLUMN + PROJECT_STANDARD_COLUMNS; kept for callers that list all field keys. */
export const PROJECT_BUILTIN_COLUMNS = [
  PROJECT_LOCKED_COLUMN,
  ...PROJECT_STANDARD_COLUMNS.map(({ key, label }) => ({ key, label })),
] as const;

export type ProjectBuiltinKey = (typeof PROJECT_BUILTIN_COLUMNS)[number]["key"];

/** Only Compal name + Actions stay fixed / non-removable. */
const RESERVED_HEADER_LABELS = new Set([
  PROJECT_LOCKED_COLUMN.label.trim().toUpperCase(),
  "ACTIONS",
]);

function normalizeLabel(label: string): string {
  return label.trim().toUpperCase();
}

export function isReservedProjectColumnLabel(label: string): boolean {
  return RESERVED_HEADER_LABELS.has(normalizeLabel(label));
}

export function findStandardProjectColumn(
  labelOrId: string,
): (typeof PROJECT_STANDARD_COLUMNS)[number] | undefined {
  const trimmed = labelOrId.trim();
  if (!trimmed) return undefined;
  const upper = normalizeLabel(trimmed);
  return PROJECT_STANDARD_COLUMNS.find(
    (col) => col.id === trimmed || col.key === trimmed || normalizeLabel(col.label) === upper,
  );
}

export function isStandardProjectColumnId(columnId: string): boolean {
  return PROJECT_STANDARD_COLUMNS.some((col) => col.id === columnId || col.key === columnId);
}

export function standardKeyForColumn(col: Pick<ProjectColumn, "id" | "label">): ProjectStandardKey | null {
  const match = findStandardProjectColumn(col.id) ?? findStandardProjectColumn(col.label);
  return match?.key ?? null;
}

export function defaultStandardProjectColumns(): ProjectColumn[] {
  return PROJECT_STANDARD_COLUMNS.map(({ id, label }) => ({ id, label }));
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

function localColumnsSeeded(): boolean {
  return localStorage.getItem(LOCAL_COLUMNS_SEEDED_KEY) === "1";
}

function markLocalColumnsSeeded() {
  localStorage.setItem(LOCAL_COLUMNS_SEEDED_KEY, "1");
}

function normalizeManagedColumns(columns: ProjectColumn[]): ProjectColumn[] {
  return columns
    .filter((c) => !isReservedProjectColumnLabel(c.label))
    .map((c) => {
      const std = findStandardProjectColumn(c.label) ?? findStandardProjectColumn(c.id);
      if (std) return { id: std.id, label: std.label };
      return c;
    });
}

/**
 * One-time: ensure former builtins exist as removable defs (stable ids).
 * After `alreadySeeded`, Admin removals persist — missing standards are not re-inserted.
 */
export function seedStandardProjectColumns(
  columns: ProjectColumn[],
  alreadySeeded: boolean,
): { columns: ProjectColumn[]; changed: boolean; seeded: boolean } {
  if (alreadySeeded) {
    const normalized = normalizeManagedColumns(columns);
    const changed =
      normalized.length !== columns.length ||
      normalized.some((c, i) => c.id !== columns[i]?.id || c.label !== columns[i]?.label);
    return { columns: normalized, changed, seeded: true };
  }

  const next: ProjectColumn[] = [];
  let changed = false;
  const claimed = new Set<string>();

  for (const std of PROJECT_STANDARD_COLUMNS) {
    const existing = columns.find(
      (c) =>
        !claimed.has(c.id) &&
        (c.id === std.id || c.id === std.key || normalizeLabel(c.label) === normalizeLabel(std.label)),
    );
    if (existing) {
      claimed.add(existing.id);
      if (existing.id !== std.id || existing.label !== std.label) {
        next.push({ id: std.id, label: std.label });
        changed = true;
      } else {
        next.push(existing);
      }
    } else {
      next.push({ id: std.id, label: std.label });
      changed = true;
    }
  }

  for (const col of columns) {
    if (claimed.has(col.id)) continue;
    if (findStandardProjectColumn(col.label) || findStandardProjectColumn(col.id)) continue;
    if (isReservedProjectColumnLabel(col.label)) {
      changed = true;
      continue;
    }
    next.push(col);
  }

  return {
    columns: next,
    changed: changed || columns.length !== next.length,
    seeded: true,
  };
}

/**
 * Drop custom columns whose labels collide with locked headers (COMPAL / ACTIONS).
 * Migrate OWNER cell values into the builtin `owner` overlay field when a legacy
 * custom OWNER column is rewritten to the standard id during seed.
 */
function scrubLockedCustomColumns(state: ProjectsUiState): boolean {
  const locked = state.columns.filter((c) => isReservedProjectColumnLabel(c.label));
  if (locked.length === 0) return false;

  for (const col of locked) {
    for (const overlay of Object.values(state.overlays)) {
      if (overlay.custom && col.id in overlay.custom) {
        const next = { ...overlay.custom };
        delete next[col.id];
        overlay.custom = next;
      }
    }
  }

  const lockedIds = new Set(locked.map((c) => c.id));
  state.columns = state.columns.filter((c) => !lockedIds.has(c.id));
  return true;
}

function migrateOwnerCustomIntoField(state: ProjectsUiState): boolean {
  let changed = false;
  for (const col of state.columns) {
    if (normalizeLabel(col.label) !== "OWNER") continue;
    const std = findStandardProjectColumn("OWNER");
    if (!std || col.id === std.id) continue;
    for (const overlay of Object.values(state.overlays)) {
      const fromCustom = overlay.custom?.[col.id];
      if (fromCustom != null && fromCustom !== "" && (overlay.owner == null || overlay.owner === "")) {
        overlay.owner = fromCustom;
        changed = true;
      }
      if (overlay.custom && col.id in overlay.custom) {
        const next = { ...overlay.custom };
        delete next[col.id];
        overlay.custom = next;
        changed = true;
      }
    }
    col.id = std.id;
    col.label = std.label;
    changed = true;
  }
  return changed;
}

function prepareState(state: ProjectsUiState): boolean {
  let changed = scrubLockedCustomColumns(state);
  if (migrateOwnerCustomIntoField(state)) changed = true;
  const ensured = seedStandardProjectColumns(state.columns, localColumnsSeeded());
  if (ensured.changed) {
    state.columns = ensured.columns;
    changed = true;
  } else {
    state.columns = ensured.columns;
  }
  if (ensured.seeded) markLocalColumnsSeeded();
  return changed;
}

/** Snapshot for one-time local → Neon migrate (do not wipe cloud). */
export function readProjectsUiState(): ProjectsUiState {
  const state = load();
  if (prepareState(state)) save(state);
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
    if (prepareState(state)) save(state);
    return [...state.columns];
  },

  addColumn(label: string): ProjectColumn {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("欄位名稱不能空白");
    if (isReservedProjectColumnLabel(trimmed)) {
      throw new Error(`「${trimmed}」是固定欄位，無法再新增`);
    }
    const state = load();
    prepareState(state);
    if (state.columns.some((c) => normalizeLabel(c.label) === normalizeLabel(trimmed))) {
      throw new Error("欄位名稱已存在");
    }
    const std = findStandardProjectColumn(trimmed);
    const col: ProjectColumn = std
      ? { id: std.id, label: std.label }
      : { id: crypto.randomUUID(), label: trimmed };
    state.columns.push(col);
    save(state);
    return col;
  },

  removeColumn(columnId: string) {
    const state = load();
    prepareState(state);
    const target = state.columns.find((c) => c.id === columnId);
    if (!target) return;
    if (isReservedProjectColumnLabel(target.label)) {
      throw new Error("固定欄位無法刪除");
    }
    state.columns = state.columns.filter((c) => c.id !== columnId);
    // Standard field values live on project rows — keep them so re-add restores cells.
    if (!isStandardProjectColumnId(columnId)) {
      for (const overlay of Object.values(state.overlays)) {
        if (overlay.custom && columnId in overlay.custom) {
          const next = { ...overlay.custom };
          delete next[columnId];
          overlay.custom = next;
        }
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
