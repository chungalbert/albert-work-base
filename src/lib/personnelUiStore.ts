import type { PersonnelColumn, PersonnelRole, Profile } from "./types";
import { normalizePersonnelRole } from "./types";

const KEY = "awb-personnel-ui-v1";

interface PersonOverlay {
  display_name?: string;
  unit?: string;
  email?: string;
  personnel_role?: PersonnelRole;
  custom?: Record<string, string>;
}

interface PersonnelUiState {
  columns: PersonnelColumn[];
  overlays: Record<string, PersonOverlay>;
}

function empty(): PersonnelUiState {
  return { columns: [], overlays: {} };
}

function load(): PersonnelUiState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as PersonnelUiState;
    return {
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
      overlays: parsed.overlays && typeof parsed.overlays === "object" ? parsed.overlays : {},
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
      personnel_role: overlay.personnel_role ?? profile.personnel_role,
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

    state.overlays[userId] = nextOverlay;
    save(state);
    return personnelUiStore.mergeProfile({ ...base, ...nextOverlay, custom: { ...(base.custom ?? {}), ...(nextOverlay.custom ?? {}) } });
  },
};
