const SCRIPT_NAME = "WHEA_Hardware_Analyzer_GUI_v1.3.1.ps1";
const SCRIPT_HREF = `${import.meta.env.BASE_URL}tools/${SCRIPT_NAME}`;

export function WheaToolPage({ onBack }: { onBack?: () => void }) {
  return (
    <section className="tool-detail-page">
      <div className="page-head page-head-compact">
        <div>
          <p className="guide-kicker">Tool</p>
          <h1>WHEA Analyzer</h1>
          <p>
            Windows PowerShell GUI（v1.3.1）：讀取匯出的 System.evtx，搜尋
            Microsoft-Windows-WHEA-Logger Warning，列出 PCIe BDF / HeaderLog / AER
            狀態並解碼 PCIe TLP Header。需在本機以 PowerShell 執行（建議系統管理員）。
          </p>
        </div>
        <button className="btn" type="button" onClick={() => onBack?.()}>
          返回 Tool
        </button>
      </div>

      <div className="panel guide-section">
        <h2>下載與使用</h2>
        <ol className="hint" style={{ paddingLeft: "1.25rem", lineHeight: 1.7 }}>
          <li>下載下方腳本到 Windows 機器。</li>
          <li>以 PowerShell 5.1+ 執行（或先打包成 EXE）。</li>
          <li>載入匯出的 System.evtx 進行 WHEA 硬體錯誤分析。</li>
        </ol>
        <p style={{ marginTop: "1rem" }}>
          <a className="btn btn-blue" href={SCRIPT_HREF} download={SCRIPT_NAME}>
            下載 {SCRIPT_NAME}
          </a>
        </p>
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          版權所有 Compal KS SW · 檔案：<code>public/tools/{SCRIPT_NAME}</code>
        </p>
      </div>
    </section>
  );
}
