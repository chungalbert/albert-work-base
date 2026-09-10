import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { hasSupabaseConfig } from "../lib/util";
import { api } from "../lib/api";

export function LoginPage() {
  const { signIn } = useAuth();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(account.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
    } finally {
      setBusy(false);
    }
  };

  const bootstrap = async () => {
    setError("");
    setBusy(true);
    try {
      await api.bootstrapAdmin(account.trim() || "admin", password, adminEmail.trim());
      setError("已送出註冊。若信箱需驗證，請先到信箱點連結，再回來登入。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立管理員失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={onSubmit}>
        <span className="mark" aria-hidden="true">A</span>
        <h1>Albert的工作基地</h1>
        <p>
          {hasSupabaseConfig()
            ? "請用帳號或 EMAIL 登入。權限依帳號角色而定。"
            : "請用帳號登入。管理員、專案領導、專案成員看到的功能不同。"}
        </p>
        <div className="field">
          <label htmlFor="account">帳號</label>
          <input
            id="account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">密碼</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <p className="gate-error" role="alert">{error}</p>
        <button className="gate-submit" type="submit" disabled={busy}>
          {busy ? "…" : "進入"}
        </button>
        {hasSupabaseConfig() && (
          <p className="hint" style={{ marginTop: 16 }}>
            第一次使用雲端？
            <button type="button" className="logout" style={{ marginLeft: 8 }} onClick={() => setShowSetup((v) => !v)}>
              建立管理員
            </button>
          </p>
        )}
        {showSetup && (
          <div style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="admin-email">管理員 EMAIL</label>
              <input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-gold" type="button" onClick={bootstrap} disabled={busy}>
              用上面的帳號密碼建立第一個管理員
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
