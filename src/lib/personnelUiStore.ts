import type { PersonnelColumn, PersonnelRole, Profile, ProjectMember } from "./types";
import { normalizePersonnelRole } from "./types";

const KEY = "awb-personnel-ui-v1";

interface PersonOverlay {
  display_name?: string;
  unit?: string;
  email?: string;
  personnel_role?: PersonnelRole;
  custom?: Record<string, string>;
  projectIds?: string[];
}

interface PersonnelUiState {
  columns: PersonnelColumn[];
  overlays: Record<string, PersonOverlay>;
  /** Client-created members when cloud invite is unavailable. */
  extraMembers: Profile[];
}

function empty(): PersonnelUiState {
  return { columns: [], overlays: {}, extraMembers: [] };
}

function load(): PersonnelUiState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as PersonnelUiState;
    return {
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
      overlays: parsed.overlays && typeof parsed.overlays === "object" ? parsed.overlays : {},
      extraMembers: Array.isArray(parsed.extraMembers) ? parsed.extraMembers : [],
    };
  } catch {
    return empty();
  }
}

function save(state: PersonnelUiState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** Import columns previously stored only in the local awb-store. */
export function importColumnsIfEmpty(existing: PersonnelColumn[]) {
  const state = load();
  if (state.columns.length > 0 || existing.length === 0) return;
  state.columns = existing.map((c) => ({ id: c.id, label: c.label }));
  save(state);
}

export const personnelUiStore = {
  listColumns(): PersonnelColumn[] {
    return [...load().columns];
  },

  addColumn(label: string): PersonnelColumn {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("欄位名稱不能空白");
    const state = load();
    const col: PersonnelColumn = { id: crypto.randomUUID(), label: trimmed };
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

  mergeProfile(profile: Profile): Profile {
    const overlay = load().overlays[profile.id] ?? {};
    const custom = { ...(profile.custom ?? {}), ...(overlay.custom ?? {}) };
    const next: Profile = {
      ...profile,
      display_name: overlay.display_name ?? profile.display_name,
      unit: overlay.unit ?? profile.unit,
      email: overlay.email ?? profile.email,
      // Neon profiles.personnel_role is source of truth when present; overlay fills gaps
      // (pre-migration localStorage, or local-only mode).
      personnel_role: profile.personnel_role ?? overlay.personnel_role,
      custom,
    };
    next.personnel_role = normalizePersonnelRole(next);
    next.is_admin = next.personnel_role === "Admin";
    return next;
  },

  applyOverlay(
    userId: string,
    base: Profile,
    patch: {
      display_name?: string;
      unit?: string;
      email?: string;
      personnel_role?: PersonnelRole;
      custom?: Record<string, string>;
      projectIds?: string[];
    },
  ): Profile {
    const state = load();
    const prev = state.overlays[userId] ?? {};
    const nextOverlay: PersonOverlay = { ...prev };

    if (patch.display_name !== undefined) {
      const name = patch.display_name.trim();
      if (!name) throw new Error("姓名不能空白");
      nextOverlay.display_name = name;
    }
    if (patch.unit !== undefined) nextOverlay.unit = patch.unit.trim();
    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase();
      if (!email) throw new Error("EMAIL 不能空白");
      nextOverlay.email = email;
    }
    if (patch.personnel_role !== undefined) {
      nextOverlay.personnel_role = patch.personnel_role;
    }
    if (patch.custom !== undefined) {
      nextOverlay.custom = { ...(prev.custom ?? {}), ...patch.custom };
    }
    if (patch.projectIds !== undefined) {
      nextOverlay.projectIds = [...patch.projectIds];
    }

    state.overlays[userId] = nextOverlay;
    // Keep extra member record in sync when present.
    const extraIdx = state.extraMembers.findIndex((p) => p.id === userId);
    if (extraIdx >= 0) {
      state.extraMembers[extraIdx] = {
        ...state.extraMembers[extraIdx],
        display_name: nextOverlay.display_name ?? state.extraMembers[extraIdx].display_name,
        unit: nextOverlay.unit ?? state.extraMembers[extraIdx].unit,
        email: nextOverlay.email ?? state.extraMembers[extraIdx].email,
        personnel_role: nextOverlay.personnel_role ?? state.extraMembers[extraIdx].personnel_role,
        custom: { ...(state.extraMembers[extraIdx].custom ?? {}), ...(nextOverlay.custom ?? {}) },
        is_admin: (nextOverlay.personnel_role ?? state.extraMembers[extraIdx].personnel_role) === "Admin",
      };
    }
    save(state);
    return personnelUiStore.mergeProfile({ ...base, ...nextOverlay, custom: { ...(base.custom ?? {}), ...(nextOverlay.custom ?? {}) } });
  },

  listExtraMembers(): Profile[] {
    return load().extraMembers.map((p) => personnelUiStore.mergeProfile(p));
  },

  addExtraMember(profile: Profile, projectIds: string[] = []): Profile {
    const state = load();
    const normalized = {
      ...profile,
      personnel_role: normalizePersonnelRole(profile),
      is_admin: normalizePersonnelRole(profile) === "Admin",
      custom: profile.custom ?? {},
    };
    state.extraMembers = state.extraMembers.filter(
      (p) => p.id !== normalized.id && p.email.toLowerCase() !== normalized.email.toLowerCase(),
    );
    state.extraMembers.push(normalized);
    state.overlays[normalized.id] = {
      ...(state.overlays[normalized.id] ?? {}),
      display_name: normalized.display_name,
      unit: normalized.unit,
      email: normalized.email,
      personnel_role: normalized.personnel_role,
      custom: normalized.custom,
      projectIds,
    };
    save(state);
    return personnelUiStore.mergeProfile(normalized);
  },

  removeExtraMember(userId: string) {
    const state = load();
    state.extraMembers = state.extraMembers.filter((p) => p.id !== userId);
    delete state.overlays[userId];
    save(state);
  },

  listExtraMemberships(): ProjectMember[] {
    const state = load();
    const rows: ProjectMember[] = [];
    for (const profile of state.extraMembers) {
      const ids = state.overlays[profile.id]?.projectIds ?? [];
      for (const projectId of ids) {
        rows.push({ project_id: projectId, user_id: profile.id, role: "member" });
      }
    }
    return rows;
  },

  setExtraProjectIds(userId: string, projectIds: string[]) {
    const state = load();
    const prev = state.overlays[userId] ?? {};
    state.overlays[userId] = { ...prev, projectIds: [...projectIds] };
    save(state);
  },
};
