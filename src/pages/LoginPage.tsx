import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { hasSupabaseConfig } from "../lib/util";
import { api } from "../lib/api";

export function LoginPage() {
  const { signIn, refresh } = useAuth();
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
      if (!adminEmail.trim()) throw new Error("請填管理員 EMAIL。");
      if (password.length < 6) throw new Error("密碼至少 6 個字。");
      await api.bootstrapAdmin(account.trim() || "admin", password, adminEmail.trim());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立管理員失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app landing-app">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="./">
            <span className="brand-name">KSSW</span>
          </a>
          <div className="header-right">
            <nav className="header-nav">
              <button type="button" onClick={() => document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" })}>Features</button>
              <button type="button" onClick={() => setShowLogin(true)}>Issues</button>
              <button type="button" onClick={() => setShowLogin(true)}>Schedule</button>
              <button type="button" onClick={() => setShowLogin(true)}>Weekly report</button>
              <button type="button" onClick={() => setShowLogin(true)}>Tracker</button>
            </nav>
            <div className="auth-chip">
              <span className="muted-label">Not signed in</span>
              <button className="btn-blue" type="button" onClick={() => setShowLogin(true)}>Login</button>
            </div>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <h1>KSSW <span className="ver">V1</span></h1>
          <p className="lead">Projects, people, issues, schedule, weekly report, and tracker — one workspace.</p>
        </section>

        <section className="tool-grid" id="tools" aria-label="Features">
          <article
            className="tool-card"
            role="button"
            tabIndex={0}
            onClick={() => setShowLogin(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowLogin(true); } }}
          >
            <div className="icon-box icon-blue" aria-hidden="true">◇</div>
            <h2>Projects &amp; Issues</h2>
            <p>Manage projects, assign people, and track issue status through Opening → Verify.</p>
            <span className="ok-pill">Available</span>
          </article>
          <article
            className="tool-card"
            role="button"
            tabIndex={0}
            onClick={() => setShowLogin(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowLogin(true); } }}
          >
            <div className="icon-box icon-green" aria-hidden="true">▣</div>
            <h2>Schedule &amp; Report</h2>
            <p>Gantt scheduling, weekly reports, and BIOS/MEFW tracker in one place.</p>
            <span className="ok-pill">Available</span>
          </article>
        </section>

        {showLogin && (
          <div className="login-overlay" onClick={() => setShowLogin(false)}>
            <form className="login-card gate-card" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0 }}>Login</h2>
              <p className="hint">Use account or EMAIL. First time: create admin (password ≥ 6 chars).</p>
              <div className="field">
                <label htmlFor="account">Account</label>
                <input
                  id="account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
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
                {busy ? "…" : "Login"}
              </button>
              {hasSupabaseConfig() && (
                <p className="hint" style={{ marginTop: 16 }}>
                  First cloud setup?
                  <button type="button" className="ghost" onClick={() => setShowSetup((v) => !v)}>
                    Create admin
                  </button>
                </p>
              )}
              {showSetup && (
                <div style={{ marginTop: 16 }}>
                  <div className="field">
                    <label htmlFor="admin-email">Admin EMAIL</label>
                    <input
                      id="admin-email"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button className="btn btn-gold" type="button" onClick={bootstrap} disabled={busy}>
                    Create first admin with credentials above
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        <section className="how-card">
          <h2>How to use</h2>
          <ol>
            <li>Click <strong>Login</strong> — use the account or EMAIL from Personnel (e.g. lay). New users: password 123456</li>
            <li>After login, use sidebar <strong>Change password</strong> anytime</li>
            <li>Leaders manage personnel and issues; members see their own work</li>
            <li>Dashboard summarizes open / alert / closed issues for the selected project filter</li>
          </ol>
        </section>
      </main>

      <footer className="site-footer">KSSW · V1</footer>
    </div>
  );
}
