import { useEffect, useState } from "react";
import {
  getSharedStoreStatus,
  migrateLocalSharedToCloud,
  type SharedStoreStatus,
} from "../lib/sharedStore";
import { useSaveStatus } from "../lib/useSaveStatus";
import { SavingIndicator } from "./SavingIndicator";

export function SharedStoreBanner({ onMigrated }: { onMigrated?: () => void }) {
  const [status, setStatus] = useState<SharedStoreStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const { saveStatus, runSave } = useSaveStatus();

  const refresh = async () => {
    setStatus(await getSharedStoreStatus());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const pending = (status?.localNoteCount ?? 0) + (status?.localOtpCount ?? 0);
  const showUpload = Boolean(status?.cloudReady && pending > 0);

  const onUpload = async () => {
    setBusy(true);
    setInfo("");
    try {
      const result = await runSave(async () => migrateLocalSharedToCloud(true));
      setInfo(`已上傳 ${result.otp} 筆 OTP、${result.notes} 則 Note 到共用雲端。`);
      await refresh();
      onMigrated?.();
    } catch (err) {
      setInfo(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const warn = status.cloudConfigured && !status.cloudReady;

  return (
    <div className={`shared-store-banner${warn ? " is-warn" : ""}`} role="status">
      <p>{status.message}</p>
      {showUpload && (
        <div className="shared-store-banner-actions">
          <SavingIndicator status={saveStatus} />
          <button type="button" className="btn btn-blue" disabled={busy} onClick={() => void onUpload()}>
            {busy ? "Uploading…" : "Upload local to shared vault"}
          </button>
        </div>
      )}
      {info && <p className="shared-store-banner-info">{info}</p>}
    </div>
  );
}
