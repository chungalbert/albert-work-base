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
  const [showLogin, setShowLogin] = useState(false);
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
    <div className="app">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="./">
            <span className="mark" aria-hidden="true">⚡</span>
            <span className="brand-name">Albert 工作基地</span>
          </a>
          <div className="header-right">
            <nav className="header-nav">
              <button type="button" onClick={() => document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" })}>工具列表</button>
              <button type="button" onClick={() => setShowLogin(true)}>任務</button>
              <button type="button" onClick={() => setShowLogin(true)}>甘特圖</button>
              <button type="button" onClick={() => setShowLogin(true)}>週報</button>
            </nav>
            <div className="auth-chip">
              <span className="muted-label">未登入</span>
              <button className="btn-blue" type="button" onClick={() => setShowLogin(true)}>登入</button>
            </div>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <h1>Albert 工作基地 <span className="ver">V1</span></h1>
          <p className="lead">人員、任務、甘特圖與週報，同一專案內的成員皆可使用。</p>
        </section>

        <section className="tool-grid" id="tools" aria-label="功能">
          <article
            className="tool-card"
            role="button"
            tabIndex={0}
            onClick={() => setShowLogin(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowLogin(true); } }}
          >
            <div className="icon-box icon-orange" aria-hidden="true">👥</div>
            <h2>人員與任務</h2>
            <p>批量開通帳號（單位、EMAIL），再由專案領導用下拉選單把人加進專案。任務可設 Deadline 與當前狀態。</p>
            <span className="ok-pill">可用</span>
          </article>
          <article
            className="tool-card"
            role="button"
            tabIndex={0}
            onClick={() => setShowLogin(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowLogin(true); } }}
          >
            <div className="icon-box icon-yellow" aria-hidden="true">📊</div>
            <h2>甘特圖與週報</h2>
            <p>拖曳調整 Schedule，一鍵產生本週 Weekly Report，可列印／存 PDF 或下載 HTML。</p>
            <span className="ok-pill">可用</span>
          </article>
        </section>

        {showLogin && (
          <div className="login-overlay" onClick={() => setShowLogin(false)}>
            <form className="login-card gate-card" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0 }}>登入</h2>
              <p className="hint">請填人員表上的「帳號」或 EMAIL（例如 lay、lay_zhang），也可以用姓名。密碼預設 123456。</p>
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
              <button className="btn-blue" type="submit" disabled={busy}>
                {busy ? "…" : "登入"}
              </button>
              {hasSupabaseConfig() && (
                <p className="hint" style={{ marginTop: 16 }}>
                  第一次使用雲端？
                  <button type="button" className="ghost" onClick={() => setShowSetup((v) => !v)}>
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
          </div>
        )}

        <section className="how-card">
          <h2>如何使用</h2>
          <ol>
            <li>點右上角 <strong>登入</strong>，帳號用人員表上的「帳號」或 EMAIL（例如 lay、lay_zhang），新人員密碼 123456</li>
            <li>登入後可點右上角 <strong>修改密碼</strong> 自行更換</li>
            <li>管理員／專案領導新增人員與任務，並填寫當前狀態</li>
            <li>其他成員登入後只會看到自己的任務、甘特圖與週報</li>
          </ol>
        </section>
      </main>

      <footer className="site-footer">版權所有 Albert 工作基地 · V1</footer>
    </div>
  );
}
