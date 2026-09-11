import { FormEvent, useState } from "react";
import { api } from "../lib/api";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setOk("");
    if (next !== confirm) {
      setError("兩次輸入的新密碼不一致");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setOk("密碼已更新，之後請用新密碼登入。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-overlay" onClick={onClose}>
      <form className="login-card gate-card" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>修改密碼</h2>
        <p className="hint">任何人登入後都可以改自己的密碼。新開通帳號的預設密碼是 123456。</p>
        <div className="field">
          <label htmlFor="pw-current">目前密碼</label>
          <input
            id="pw-current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pw-next">新密碼</label>
          <input
            id="pw-next"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">再輸入一次新密碼</label>
          <input
            id="pw-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <p className="error">{error}</p>
        {ok && <p className="hint">{ok}</p>}
        <div className="row">
          <button className="btn-blue" type="submit" disabled={busy}>
            {busy ? "儲存中…" : "儲存"}
          </button>
          <button className="btn" type="button" onClick={onClose}>關閉</button>
        </div>
      </form>
    </div>
  );
}
