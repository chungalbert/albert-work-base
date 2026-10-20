import { FormEvent, type MouseEvent, useEffect, useMemo, useState } from "react";
import { SavingIndicator } from "../components/SavingIndicator";
import { SharedStoreBanner } from "../components/SharedStoreBanner";
import { copyTextToClipboard } from "../lib/clipboard";
import { otpVaultStore } from "../lib/otpVaultStore";
import { formatCode, generateTotp, parseOtpInput, totpRemaining } from "../lib/totp";
import type { OtpVaultEntry } from "../lib/types";
import { useSaveStatus } from "../lib/useSaveStatus";

type AddForm = {
  paste: string;
  label: string;
  issuer: string;
  account: string;
  access_password: string;
};

const EMPTY_FORM: AddForm = {
  paste: "",
  label: "",
  issuer: "",
  account: "",
  access_password: "",
};

export function OtpVaultPage({
  onGoDashboard,
  ownerId,
}: {
  onGoDashboard?: () => void;
  ownerId?: string;
}) {
  const [entries, setEntries] = useState<OtpVaultEntry[]>([]);
  const [tick, setTick] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** Session unlocks: entryId → true after correct access_password. */
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [unlockDraft, setUnlockDraft] = useState<Record<string, string>>({});
  const { saveStatus, runSave } = useSaveStatus();

  const refresh = async () => {
    setEntries(await otpVaultStore.list());
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = useMemo(() => totpRemaining(30), [tick]);

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await runSave(async () => {
        const parsed = parseOtpInput(form.paste);
        await otpVaultStore.add({
          secret: parsed.secret,
          qr_text: parsed.qr_text,
          issuer: form.issuer.trim() || parsed.issuer,
          account: form.account.trim() || parsed.account,
          label: form.label.trim() || parsed.label,
          access_password: form.access_password.trim() || undefined,
          owner_id: ownerId,
        });
        setForm(EMPTY_FORM);
        setShowAdd(false);
        await refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add entry");
    }
  };

  const onDelete = async (id: string) => {
    const ok = window.confirm("Delete this OTP entry?");
    if (!ok) return;
    setError("");
    try {
      await runSave(async () => {
        await otpVaultStore.remove(id);
        setUnlocked((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        await refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const onCopy = async (id: string, code: string, event?: MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    try {
      await copyTextToClipboard(code.replace(/\s/g, ""));
      setError("");
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      setError("Clipboard copy failed — 無法複製到剪貼簿");
    }
  };

  const tryUnlock = (entry: OtpVaultEntry) => {
    const draft = (unlockDraft[entry.id] ?? "").trim();
    if (!entry.access_password) {
      setUnlocked((prev) => ({ ...prev, [entry.id]: true }));
      return;
    }
    if (draft === entry.access_password) {
      setUnlocked((prev) => ({ ...prev, [entry.id]: true }));
      setUnlockDraft((prev) => ({ ...prev, [entry.id]: "" }));
      setError("");
    } else {
      setError("Wrong access password");
    }
  };

  const isOpen = (entry: OtpVaultEntry) =>
    !entry.access_password || Boolean(unlocked[entry.id]);

  return (
    <div className="otp-page">
      <header className="otp-toolbar">
        <nav className="otp-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="otp-bc-home" onClick={onGoDashboard} aria-label="Tool">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </button>
          <button type="button" className="otp-bc-link" onClick={onGoDashboard}>
            Tool
          </button>
          <span className="otp-bc-sep" aria-hidden="true">›</span>
          <span className="otp-bc-current">OTP Vault</span>
        </nav>
        <div className="otp-toolbar-actions">
          <SavingIndicator status={saveStatus} />
          <button type="button" className="otp-add-btn" onClick={() => { setShowAdd(true); setError(""); }}>
            + Add
          </button>
        </div>
      </header>

      <div className="otp-body">
        <SharedStoreBanner onMigrated={() => void refresh()} />
        {error && !showAdd && <p className="otp-error">{error}</p>}

        {entries.length === 0 ? (
          <div className="otp-empty">
            <h2>OTP Vault</h2>
            <p>共用 TOTP 密碼庫：所有登入成員看到同一份清單（雲端 Supabase；本機模式為 org store）。</p>
            <button type="button" className="otp-add-btn" onClick={() => setShowAdd(true)}>
              + Add entry
            </button>
          </div>
        ) : (
          <ul className="otp-list">
            {entries.map((entry) => {
              const open = isOpen(entry);
              let code = "••••••";
              let codeRaw = "";
              let genError = "";
              if (open) {
                try {
                  codeRaw = generateTotp(entry.secret);
                  code = formatCode(codeRaw);
                } catch {
                  genError = "Invalid secret";
                  code = "—— ——";
                }
              }
              return (
                <li key={entry.id} className="otp-card">
                  {entry.thumb ? (
                    <img className="otp-thumb" src={entry.thumb} alt="" />
                  ) : (
                    <div className="otp-thumb otp-thumb-fallback" aria-hidden="true">
                      {(entry.issuer || entry.label || "?").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="otp-card-main">
                    <div className="otp-card-head">
                      <h3 className="otp-label">{entry.label || entry.issuer || "OTP"}</h3>
                      <button
                        type="button"
                        className="otp-delete"
                        title="Delete"
                        aria-label={`Delete ${entry.label}`}
                        onClick={() => onDelete(entry.id)}
                      >
                        ×
                      </button>
                    </div>
                    <p className="otp-meta">
                      {[entry.issuer, entry.account].filter(Boolean).join(" · ") || "—"}
                    </p>

                    {!open ? (
                      <div className="otp-lock">
                        <input
                          type="password"
                          placeholder="Access password"
                          value={unlockDraft[entry.id] ?? ""}
                          onChange={(e) =>
                            setUnlockDraft((prev) => ({ ...prev, [entry.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") tryUnlock(entry);
                          }}
                          aria-label="Access password"
                        />
                        <button type="button" className="otp-unlock-btn" onClick={() => tryUnlock(entry)}>
                          Unlock
                        </button>
                      </div>
                    ) : (
                      <div className="otp-code-row">
                        <div className="otp-code-block">
                          <span className="otp-code" aria-live="polite">
                            {genError || code}
                          </span>
                          <span className="otp-countdown" title="Seconds remaining">
                            {remaining}s
                          </span>
                          <div className="otp-bar" aria-hidden="true">
                            <span style={{ width: `${(remaining / 30) * 100}%` }} />
                          </div>
                        </div>
                        <button
                          type="button"
                          className="otp-copy-btn"
                          disabled={Boolean(genError)}
                          onClick={(e) => void onCopy(entry.id, codeRaw, e)}
                        >
                          {copiedId === entry.id ? "已複製" : "Copy"}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showAdd && (
        <div className="otp-modal-backdrop" onClick={() => setShowAdd(false)}>
          <form
            className="otp-modal"
            onSubmit={onAdd}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Add OTP</h2>
            <p className="otp-hint">Paste a Base32 secret or an otpauth:// URI. Secrets stay in this browser only.</p>
            <label className="otp-field">
              <span>Secret / otpauth URI</span>
              <textarea
                rows={3}
                value={form.paste}
                onChange={(e) => setForm((f) => ({ ...f, paste: e.target.value }))}
                placeholder="otpauth://totp/… or BASE32SECRET"
                required
                autoFocus
              />
            </label>
            <div className="otp-field-row">
              <label className="otp-field">
                <span>Issuer</span>
                <input
                  value={form.issuer}
                  onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
                  placeholder="Microsoft"
                />
              </label>
              <label className="otp-field">
                <span>Account</span>
                <input
                  value={form.account}
                  onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
                  placeholder="user@example.com"
                />
              </label>
            </div>
            <label className="otp-field">
              <span>Label (optional)</span>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Issuer · account"
              />
            </label>
            <label className="otp-field">
              <span>Access password (optional)</span>
              <input
                type="password"
                value={form.access_password}
                onChange={(e) => setForm((f) => ({ ...f, access_password: e.target.value }))}
                placeholder="Lock viewing codes"
                autoComplete="new-password"
              />
            </label>
            {error && <p className="otp-error">{error}</p>}
            <div className="otp-modal-actions">
              <button type="button" className="otp-btn-ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button type="submit" className="otp-btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
