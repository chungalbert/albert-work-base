import { cloudApi } from "./cloudApi";
import { localApi } from "./localApi";
import { hasSupabaseConfig } from "./util";

const MIGRATE_FLAG = "awb-shared-cloud-migrated-v1";
const PROBE_TTL_MS = 15_000;

export type SharedStoreStatus = {
  /** Cloud env present (VITE_NEON_URL or legacy VITE_SUPABASE_*). */
  cloudConfigured: boolean;
  /** Shared tables reachable for all authenticated users. */
  cloudReady: boolean;
  /** Local leftovers from pre-migration / #35 fallback silo. */
  localNoteCount: number;
  localOtpCount: number;
  /** Human-readable status for banners. */
  message: string;
};

let lastProbeOk: boolean | null = null;
let lastProbeAt = 0;
let migrateInFlight: Promise<{ notes: number; otp: number }> | null = null;

export function isSharedStoreUnavailableError(err: unknown): boolean {
  const msg = (
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : err instanceof Error
        ? err.message
        : String(err ?? "")
  ).toLowerCase();
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    (msg.includes("does not exist") && (msg.includes("shared_notes") || msg.includes("otp_vault"))) ||
    (msg.includes("shared_notes") && msg.includes("not find")) ||
    (msg.includes("otp_vault_entries") && msg.includes("not find"))
  );
}

export const CLOUD_TABLES_MISSING_MESSAGE =
  "共用雲端資料表尚未建立，無法跨帳號同步。請管理員對 Neon 執行 neon/schema.sql（或舊路徑 docs/apply-shared-notes-otp.md），然後重新整理。";

/** Probe shared tables. Never sticky-fails for the whole session — rechecks after TTL. */
export async function probeSharedCloudReady(force = false): Promise<boolean> {
  if (!hasSupabaseConfig()) {
    lastProbeOk = false;
    return false;
  }
  const now = Date.now();
  if (!force && lastProbeOk !== null && now - lastProbeAt < PROBE_TTL_MS) {
    return lastProbeOk;
  }
  try {
    await Promise.all([cloudApi.listNotes(), cloudApi.listOtpEntries()]);
    lastProbeOk = true;
  } catch (err) {
    if (isSharedStoreUnavailableError(err)) {
      lastProbeOk = false;
    } else {
      // Auth / network — do not treat as missing tables; surface to caller.
      lastProbeAt = now;
      throw err;
    }
  }
  lastProbeAt = now;
  return Boolean(lastProbeOk);
}

/** Mark tables ready after a successful cloud call (clears degraded TTL). */
export function markSharedCloudReady() {
  lastProbeOk = true;
  lastProbeAt = Date.now();
}

export function markSharedCloudUnavailable() {
  lastProbeOk = false;
  lastProbeAt = Date.now();
}

export function getLocalSharedCounts(): { notes: number; otp: number } {
  return {
    notes: localApi.listNotes().length,
    otp: localApi.listOtpEntries().length,
  };
}

export async function getSharedStoreStatus(): Promise<SharedStoreStatus> {
  const cloudConfigured = hasSupabaseConfig();
  const counts = getLocalSharedCounts();
  if (!cloudConfigured) {
    return {
      cloudConfigured: false,
      cloudReady: false,
      localNoteCount: counts.notes,
      localOtpCount: counts.otp,
      message: "本機模式：Note / OTP 存在此瀏覽器的 org store（awb-store-v1）。雲端部署請套用 shared tables migration。",
    };
  }
  let cloudReady = false;
  try {
    cloudReady = await probeSharedCloudReady();
  } catch {
    cloudReady = false;
  }
  if (cloudReady) {
    const pending = counts.notes + counts.otp;
    return {
      cloudConfigured: true,
      cloudReady: true,
      localNoteCount: counts.notes,
      localOtpCount: counts.otp,
      message:
        pending > 0
          ? `雲端共用已就緒（所有登入成員可見）。此瀏覽器還有 ${counts.otp} 筆 OTP、${counts.notes} 則 Note 僅存在本機，請上傳到共用庫。`
          : "雲端共用已就緒 — 所有登入成員看到同一份 Note / OTP（Supabase shared_notes / otp_vault_entries）。",
    };
  }
  return {
    cloudConfigured: true,
    cloudReady: false,
    localNoteCount: counts.notes,
    localOtpCount: counts.otp,
    message: CLOUD_TABLES_MISSING_MESSAGE,
  };
}

/**
 * One-time (per browser) upsert of local Note/OTP leftovers into Supabase,
 * then clear local shared arrays so Admin's silo data becomes org-visible.
 */
export async function migrateLocalSharedToCloud(force = false): Promise<{ notes: number; otp: number }> {
  if (!hasSupabaseConfig()) {
    throw new Error("本機模式無需上傳。");
  }
  if (!force && localStorage.getItem(MIGRATE_FLAG) === "1" && getLocalSharedCounts().notes + getLocalSharedCounts().otp === 0) {
    return { notes: 0, otp: 0 };
  }
  if (migrateInFlight) return migrateInFlight;

  migrateInFlight = (async () => {
    const ready = await probeSharedCloudReady(true);
    if (!ready) throw new Error(CLOUD_TABLES_MISSING_MESSAGE);

    const localNotes = localApi.listNotes();
    const localOtps = localApi.listOtpEntries();
    let notes = 0;
    let otp = 0;

    for (const note of localNotes) {
      await cloudApi.upsertSharedNote(note);
      notes += 1;
    }
    for (const entry of localOtps) {
      await cloudApi.upsertOtpEntry(entry);
      otp += 1;
    }

    if (notes + otp > 0) {
      localApi.clearSharedLocal();
    }
    localStorage.setItem(MIGRATE_FLAG, "1");
    markSharedCloudReady();
    return { notes, otp };
  })();

  try {
    return await migrateInFlight;
  } finally {
    migrateInFlight = null;
  }
}

/** After cloud becomes ready, auto-migrate once if local leftovers exist. */
export async function maybeAutoMigrateLocalShared(): Promise<void> {
  if (!hasSupabaseConfig()) return;
  if (localStorage.getItem(MIGRATE_FLAG) === "1") return;
  const { notes, otp } = getLocalSharedCounts();
  if (notes + otp === 0) {
    localStorage.setItem(MIGRATE_FLAG, "1");
    return;
  }
  try {
    if (await probeSharedCloudReady()) {
      await migrateLocalSharedToCloud();
    }
  } catch {
    /* probe / migrate failures stay quiet; UI banner prompts manual upload */
  }
}
