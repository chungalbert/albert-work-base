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
    /** Display header; Neon field remains `projects.owner`. */
    label: "PROJECT LEADER",
    id: "00000000-0000-4000-8000-0000000000d9",
  },
  {
    key: "tpe_owner",
    /**
     * Distinct from PROJECT LEADER (`projects.owner`).
     * Neon field: `projects.tpe_owner`. Legacy UI label was "TPE OWNER".
     */
    label: "Owner",
    id: "00000000-0000-4000-8000-0000000000da",
  },
] as const;

export type ProjectStandardKey = (typeof PROJECT_STANDARD_COLUMNS)[number]["key"];

/**
 * Labels that map to PROJECT LEADER (`projects.owner`).
 * Do NOT include bare "OWNER" — that maps to the separate Owner (`tpe_owner`) column.
 */
const PROJECT_LEADER_LABEL_ALIASES = new Set([
  "PROJECT LEADER",
  "PROJECT_LEADER",
  "PROJECTLEADER",
]);

/**
 * Labels that map to Owner (`projects.tpe_owner`).
 * Includes legacy "TPE OWNER" and bare "OWNER" (post–#84 PROJECT LEADER rename).
 */
const PROJECT_OWNER_LABEL_ALIASES = new Set([
  "OWNER",
  "TPE OWNER",
  "TPE_OWNER",
  "TPEOWNER",
]);

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

export function isProjectLeaderColumnLabel(label: string): boolean {
  return PROJECT_LEADER_LABEL_ALIASES.has(normalizeLabel(label));
}

export function isProjectOwnerColumnLabel(label: string): boolean {
  return PROJECT_OWNER_LABEL_ALIASES.has(normalizeLabel(label));
}

export function findStandardProjectColumn(
  labelOrId: string,
): (typeof PROJECT_STANDARD_COLUMNS)[number] | undefined {
  const trimmed = labelOrId.trim();
  if (!trimmed) return undefined;
  const upper = normalizeLabel(trimmed);

  // Prefer stable id / key matches so legacy labels on d9 stay PROJECT LEADER.
  const byIdOrKey = PROJECT_STANDARD_COLUMNS.find(
    (col) => col.id === trimmed || col.key === trimmed,
  );
  if (byIdOrKey) return byIdOrKey;

  if (PROJECT_LEADER_LABEL_ALIASES.has(upper)) {
    return PROJECT_STANDARD_COLUMNS.find((col) => col.key === "owner");
  }
  if (PROJECT_OWNER_LABEL_ALIASES.has(upper) || normalizeLabel("Owner") === upper) {
    return PROJECT_STANDARD_COLUMNS.find((col) => col.key === "tpe_owner");
  }
  return PROJECT_STANDARD_COLUMNS.find((col) => normalizeLabel(col.label) === upper);
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

/**
 * Normalize / place Owner beside PROJECT LEADER.
 * - Always rewrites legacy TPE OWNER / OWNER labels to the standard Owner def.
 * - When `insertIfMissing`, also inserts Owner after PROJECT LEADER (first seed / SQL-backed ensure).
 */
export function ensureOwnerBesideLeader(
  columns: ProjectColumn[],
  options?: { insertIfMissing?: boolean },
): {
  columns: ProjectColumn[];
  changed: boolean;
} {
  const insertIfMissing = options?.insertIfMissing ?? false;
  const ownerStd = PROJECT_STANDARD_COLUMNS.find((c) => c.key === "tpe_owner");
  const leaderStd = PROJECT_STANDARD_COLUMNS.find((c) => c.key === "owner");
  if (!ownerStd || !leaderStd) return { columns, changed: false };

  let changed = false;
  const next = columns.map((col) => {
    const std = findStandardProjectColumn(col.id) ?? findStandardProjectColumn(col.label);
    if (std?.key === "tpe_owner" && (col.id !== ownerStd.id || col.label !== ownerStd.label)) {
      changed = true;
      return { id: ownerStd.id, label: ownerStd.label };
    }
    if (std?.key === "owner" && (col.id !== leaderStd.id || col.label !== leaderStd.label)) {
      changed = true;
      return { id: leaderStd.id, label: leaderStd.label };
    }
    return col;
  });

  const ownerIdx = next.findIndex((c) => c.id === ownerStd.id);
  if (ownerIdx >= 0) {
    const leaderIdx = next.findIndex((c) => c.id === leaderStd.id);
    if (leaderIdx >= 0 && ownerIdx !== leaderIdx + 1) {
      const [ownerCol] = next.splice(ownerIdx, 1);
      const insertAt = next.findIndex((c) => c.id === leaderStd.id) + 1;
      next.splice(insertAt, 0, ownerCol);
      changed = true;
    }
    return { columns: next, changed };
  }

  if (!insertIfMissing) return { columns: next, changed };

  const leaderIdx = next.findIndex((c) => c.id === leaderStd.id);
  const ownerCol = { id: ownerStd.id, label: ownerStd.label };
  if (leaderIdx >= 0) next.splice(leaderIdx + 1, 0, ownerCol);
  else next.push(ownerCol);
  return { columns: next, changed: true };
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
  tpe_owner?: string;
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
      // Prefer id so legacy label "OWNER" on d9 stays PROJECT LEADER, not Owner.
      const std = findStandardProjectColumn(c.id) ?? findStandardProjectColumn(c.label);
      if (std) return { id: std.id, label: std.label };
      return c;
    });
}

/**
 * One-time: ensure former builtins exist as removable defs (stable ids).
 * After `alreadySeeded`, Admin removals persist — missing standards are not re-inserted,
 * except Owner (`tpe_owner`) which is ensured beside PROJECT LEADER (legacy TPE OWNER).
 */
export function seedStandardProjectColumns(
  columns: ProjectColumn[],
  alreadySeeded: boolean,
): { columns: ProjectColumn[]; changed: boolean; seeded: boolean } {
  if (alreadySeeded) {
    const normalized = normalizeManagedColumns(columns);
    // Rewrite legacy TPE OWNER → Owner; do not force-reinsert if Admin removed it
    // (Neon SQL / first seed inserts when missing).
    const ensured = ensureOwnerBesideLeader(normalized, { insertIfMissing: false });
    const changed =
      ensured.changed ||
      normalized.length !== columns.length ||
      normalized.some((c, i) => c.id !== columns[i]?.id || c.label !== columns[i]?.label);
    return { columns: ensured.columns, changed, seeded: true };
  }

  const next: ProjectColumn[] = [];
  let changed = false;
  const claimed = new Set<string>();

  for (const std of PROJECT_STANDARD_COLUMNS) {
    const existing = columns.find((c) => {
      if (claimed.has(c.id)) return false;
      if (c.id === std.id || c.id === std.key) return true;
      const matched = findStandardProjectColumn(c.label) ?? findStandardProjectColumn(c.id);
      return matched?.key === std.key;
    });
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
 * Migrate OWNER / Project Leader cell values into the builtin `owner` overlay field
 * when a legacy custom column is rewritten to the standard id during seed.
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
  const std = findStandardProjectColumn("owner");
  if (!std) return false;
  for (const col of state.columns) {
    // Only migrate by Project Leader id / explicit leader labels (not bare "OWNER").
    if (!isProjectLeaderColumnLabel(col.label) && col.id !== std.id) continue;
    if (col.id === std.id && normalizeLabel(col.label) === normalizeLabel(std.label)) continue;
    for (const overlay of Object.values(state.overlays)) {
      const fromCustom = overlay.custom?.[col.id];
      if (fromCustom != null && fromCustom !== "" && (overlay.owner == null || overlay.owner === "")) {
        overlay.owner = fromCustom;
        changed = true;
      }
      if (overlay.custom && col.id in overlay.custom && col.id !== std.id) {
        const next = { ...overlay.custom };
        delete next[col.id];
        overlay.custom = next;
        changed = true;
      }
    }
    if (col.id !== std.id || normalizeLabel(col.label) !== normalizeLabel(std.label)) {
      col.id = std.id;
      col.label = std.label;
      changed = true;
    }
  }
  return changed;
}

/** Promote legacy TPE OWNER / Owner custom cells into `tpe_owner`. */
function migrateTpeOwnerCustomIntoField(state: ProjectsUiState): boolean {
  let changed = false;
  const std = findStandardProjectColumn("tpe_owner");
  if (!std) return false;
  for (const col of state.columns) {
    const isOwnerCol =
      col.id === std.id || isProjectOwnerColumnLabel(col.label) || col.id === "tpe_owner";
    if (!isOwnerCol) continue;
    for (const overlay of Object.values(state.overlays)) {
      const fromCustom = overlay.custom?.[col.id];
      if (
        fromCustom != null &&
        fromCustom !== "" &&
        (overlay.tpe_owner == null || overlay.tpe_owner === "")
      ) {
        overlay.tpe_owner = fromCustom;
        changed = true;
      }
      if (overlay.custom && col.id in overlay.custom && col.id !== std.id) {
        const next = { ...overlay.custom };
        delete next[col.id];
        overlay.custom = next;
        changed = true;
      }
    }
    if (col.id !== std.id || col.label !== std.label) {
      col.id = std.id;
      col.label = std.label;
      changed = true;
    }
  }
  return changed;
}

function prepareState(state: ProjectsUiState): boolean {
  let changed = scrubLockedCustomColumns(state);
  if (migrateOwnerCustomIntoField(state)) changed = true;
  if (migrateTpeOwnerCustomIntoField(state)) changed = true;
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

  /** Build a column def without persisting (Admin edit-mode draft). */
  buildColumn(label: string, existing: ProjectColumn[]): ProjectColumn {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("欄位名稱不能空白");
    if (isReservedProjectColumnLabel(trimmed)) {
      throw new Error(`「${trimmed}」是固定欄位，無法再新增`);
    }
    if (existing.some((c) => normalizeLabel(c.label) === normalizeLabel(trimmed))) {
      throw new Error("欄位名稱已存在");
    }
    const std = findStandardProjectColumn(trimmed);
    if (std && existing.some((c) => c.id === std.id)) {
      throw new Error("欄位名稱已存在");
    }
    return std ? { id: std.id, label: std.label } : { id: crypto.randomUUID(), label: trimmed };
  },

  addColumn(label: string): ProjectColumn {
    const state = load();
    prepareState(state);
    const col = projectsUiStore.buildColumn(label, state.columns);
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

  /**
   * Replace managed column defs + display order in one write (Admin Save).
   * Strips custom cell overlays for removed non-standard columns.
   */
  replaceColumns(columns: ProjectColumn[]): ProjectColumn[] {
    const state = load();
    prepareState(state);
    const next = normalizeManagedColumns(columns);
    const labels = new Set<string>();
    for (const col of next) {
      const key = normalizeLabel(col.label);
      if (!col.id || !col.label.trim()) throw new Error("欄位定義不完整");
      if (isReservedProjectColumnLabel(col.label)) {
        throw new Error(`「${col.label}」是固定欄位，無法再新增`);
      }
      if (labels.has(key)) throw new Error("欄位名稱已存在");
      labels.add(key);
    }
    const prevIds = new Set(state.columns.map((c) => c.id));
    const nextIds = new Set(next.map((c) => c.id));
    for (const id of prevIds) {
      if (nextIds.has(id) || isStandardProjectColumnId(id)) continue;
      for (const overlay of Object.values(state.overlays)) {
        if (overlay.custom && id in overlay.custom) {
          const custom = { ...overlay.custom };
          delete custom[id];
          overlay.custom = custom;
        }
      }
    }
    state.columns = next;
    save(state);
    return [...state.columns];
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
      tpe_owner: overlay.tpe_owner ?? project.tpe_owner ?? "",
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
    if (patch.tpe_owner !== undefined) next.tpe_owner = patch.tpe_owner.trim();
    if (patch.custom !== undefined) {
      next.custom = { ...(prev.custom ?? {}), ...patch.custom };
    }

    state.overlays[projectId] = next;
    save(state);
    return projectsUiStore.mergeProject({ ...base, ...next, custom: { ...(base.custom ?? {}), ...(next.custom ?? {}) } });
  },
};
