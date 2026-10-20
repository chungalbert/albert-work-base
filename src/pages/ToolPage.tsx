export function ToolPage({ onOpenOtp }: { onOpenOtp?: () => void }) {
  return (
    <section className="tool-page">
      <div className="page-head page-head-compact">
        <div>
          <h1>Tool</h1>
          <p>實用小工具。先從 OTP Vault 開始，之後有新工具再往這裡加。</p>
        </div>
      </div>
      <div className="guide-list">
        <button className="panel guide-card" type="button" onClick={() => onOpenOtp?.()}>
          <h2>OTP Vault</h2>
          <p>共用 TOTP 密碼庫：即時六位數驗證碼、倒數與複製。所有登入成員可見（與專案同一套共用儲存）。</p>
          <span className="ok-pill">開啟</span>
        </button>
      </div>
    </section>
  );
}
