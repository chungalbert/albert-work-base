export function ToolPage({
  onOpenOtp,
  onOpenWhea,
}: {
  onOpenOtp?: () => void;
  onOpenWhea?: () => void;
}) {
  return (
    <section className="tool-page">
      <div className="page-head page-head-compact">
        <div>
          <h1>Tool</h1>
          <p>實用小工具。OTP Vault 與 WHEA Analyzer 都從這裡開啟。</p>
        </div>
      </div>
      <div className="guide-list">
        <button className="panel guide-card" type="button" onClick={() => onOpenOtp?.()}>
          <h2>OTP Vault</h2>
          <p>共用 TOTP 密碼庫：即時六位數驗證碼、倒數與複製。所有登入成員可見（與專案同一套共用儲存）。</p>
          <span className="ok-pill">開啟</span>
        </button>
        <button className="panel guide-card" type="button" onClick={() => onOpenWhea?.()}>
          <h2>WHEA Analyzer</h2>
          <p>Windows PowerShell 工具：分析 System.evtx 的 WHEA 硬體錯誤（PCIe BDF / HeaderLog / AER）。</p>
          <span className="ok-pill">開啟</span>
        </button>
      </div>
    </section>
  );
}
