import { api } from "./api";
import type { OtpVaultEntry } from "./types";

/**
 * Shared TOTP vault for every authenticated member.
 * Local: stored in org `awb-store-v1` (same store as projects).
 * Cloud: Supabase `otp_vault_entries` — RLS allows all authenticated users.
 * No owner / role filtering on list. Optional per-entry access_password locks codes only.
 * Secrets are never committed to git.
 */
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
  async list(): Promise<OtpVaultEntry[]> {
    return api.listOtpEntries();
  },

  async add(input: OtpAddInput): Promise<OtpVaultEntry> {
    return api.addOtpEntry(input);
  },

  async remove(id: string) {
    await api.removeOtpEntry(id);
  },
};
