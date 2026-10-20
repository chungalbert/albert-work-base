import type { OtpVaultEntry } from "./types";

const KEY = "awb-otp-vault-v1";

interface VaultState {
  entries: OtpVaultEntry[];
}

function empty(): VaultState {
  return { entries: [] };
}

function load(): VaultState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as VaultState;
    const entries = Array.isArray(parsed.entries) ? parsed.entries.filter(isEntry) : [];
    return { entries };
  } catch {
    return empty();
  }
}

function isEntry(value: unknown): value is OtpVaultEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as OtpVaultEntry;
  return (
    typeof e.id === "string" &&
    typeof e.secret === "string" &&
    e.secret.trim().length > 0 &&
    typeof e.created_at === "number"
  );
}

function save(state: VaultState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function normalizeLabel(issuer: string, account: string, label: string): string {
  const trimmed = label.trim();
  if (trimmed) return trimmed;
  if (issuer && account) return `${issuer} · ${account}`;
  return issuer || account || "OTP entry";
}

export type OtpAddInput = {
  label?: string;
  issuer?: string;
  account?: string;
  secret: string;
  qr_text?: string;
  thumb?: string;
  access_password?: string;
  owner_id?: string;
};

export const otpVaultStore = {
  list(): OtpVaultEntry[] {
    return [...load().entries].sort((a, b) => b.created_at - a.created_at);
  },

  add(input: OtpAddInput): OtpVaultEntry {
    const state = load();
    const issuer = (input.issuer ?? "").trim();
    const account = (input.account ?? "").trim();
    const entry: OtpVaultEntry = {
      id: `otp_${crypto.randomUUID()}`,
      label: normalizeLabel(issuer, account, input.label ?? ""),
      issuer,
      account,
      secret: input.secret.replace(/\s+/g, "").toUpperCase(),
      qr_text: input.qr_text?.trim() || undefined,
      thumb: input.thumb?.trim() || undefined,
      owner_id: input.owner_id?.trim() || undefined,
      access_password: input.access_password?.trim() || undefined,
      created_at: Math.floor(Date.now() / 1000),
    };
    state.entries.unshift(entry);
    save(state);
    return entry;
  },

  remove(id: string) {
    const state = load();
    state.entries = state.entries.filter((e) => e.id !== id);
    save(state);
  },

  /** Import vault JSON shape `{ entries: [...] }` — skips invalid rows. */
  importVault(raw: unknown): number {
    if (!raw || typeof raw !== "object") return 0;
    const list = (raw as VaultState).entries;
    if (!Array.isArray(list)) return 0;
    const state = load();
    let added = 0;
    for (const item of list) {
      if (!isEntry(item)) continue;
      if (state.entries.some((e) => e.id === item.id)) continue;
      state.entries.push({
        ...item,
        secret: item.secret.replace(/\s+/g, "").toUpperCase(),
        label: normalizeLabel(item.issuer ?? "", item.account ?? "", item.label ?? ""),
        created_at: typeof item.created_at === "number" ? item.created_at : Math.floor(Date.now() / 1000),
      });
      added += 1;
    }
    if (added) save(state);
    return added;
  },
};
