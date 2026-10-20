import { useRef, useState } from "react";
import { analyzeEvtxFile } from "../lib/whea/parseEvtx";
import { downloadHtml, downloadTxt } from "../lib/whea/reports";
import type { WheaAnalyzeResult } from "../lib/whea/types";

const SCRIPT_NAME = "WHEA_Hardware_Analyzer_GUI_v1.3.1.ps1";
const SCRIPT_HREF = `${import.meta.env.BASE_URL}tools/${SCRIPT_NAME}`;
const MAX_MB = 200;

export function WheaToolPage({ onBack }: { onBack?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<WheaAnalyzeResult | null>(null);

  const pickFile = (next: File | null) => {
    setError("");
    setResult(null);
    setStatus("");
    if (!next) {
      setFile(null);
      return;
    }
    if (!/\.evtx$/i.test(next.name)) {
      setError("請上傳 System.evtx（.evtx）。");
      setFile(null);
      return;
    }
    if (next.size > MAX_MB * 1024 * 1024) {
      setError(`檔案超過 ${MAX_MB}MB 上限。`);
      setFile(null);
      return;
    }
    setFile(next);
  };

  const onAnalyze = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setStatus("正在解析 EVTX 並篩選 WHEA-Logger…");
    setResult(null);
    try {
      const analyzed = await analyzeEvtxFile(file);
      setResult(analyzed);
      setStatus(
        analyzed.rows.length
          ? `完成：掃描 ${analyzed.scanned} 筆紀錄，找到 ${analyzed.rows.length} 筆 WHEA 事件。`
          : `完成：掃描 ${analyzed.scanned} 筆紀錄，未找到 Microsoft-Windows-WHEA-Logger 的 Error/Warning。`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失敗");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="whea-page">
      <header className="whea-toolbar">
        <nav className="whea-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="whea-bc-home" onClick={onBack} aria-label="Tool">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </button>
          <button type="button" className="whea-bc-link" onClick={onBack}>Tool</button>
          <span className="whea-bc-sep" aria-hidden="true">›</span>
          <span className="whea-bc-current">WHEA Analyzer</span>
        </nav>
      </header>

      <div className="whea-body">
        <div className="page-head page-head-compact">
          <div>
            <h1>WHEA 硬體錯誤分析</h1>
            <p>
              上傳匯出的 System.evtx，於瀏覽器內分析 Microsoft-Windows-WHEA-Logger
              （PCIe AER / HeaderLog / TLP、Processor MCA、Memory、Firmware）。無需下載 EXE。
            </p>
          </div>
        </div>

        <section className="panel whea-panel">
          <h2>輸入</h2>
          <p className="hint">請上傳 <code>System.evtx</code>（上限 {MAX_MB}MB）。分析在本機瀏覽器執行，檔案不會上傳到伺服器。</p>

          <div
            className={`whea-drop${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".evtx,application/octet-stream"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <p className="whea-drop-title">拖曳或點擊上傳 System.evtx</p>
            <p className="hint">{file ? `${file.name}（${(file.size / (1024 * 1024)).toFixed(2)} MB）` : "尚未選擇檔案"}</p>
          </div>

          <div className="whea-actions">
            <button type="button" className="btn-blue" disabled={!file || busy} onClick={() => void onAnalyze()}>
              {busy ? "分析中…" : "開始分析"}
            </button>
            <button type="button" className="btn" disabled={!result?.rows.length} onClick={() => result && downloadTxt(result)}>
              下載 TXT
            </button>
            <button type="button" className="btn" disabled={!result?.rows.length} onClick={() => result && downloadHtml(result)}>
              下載 HTML
            </button>
          </div>

          {status && <p className="hint whea-status" role="status">{status}</p>}
          {error && <p className="whea-error" role="alert">{error}</p>}
        </section>

        {result && (
          <section className="whea-summary" aria-label="Summary">
            <div className="whea-summary-item">
              <span className="whea-summary-label">WHEA events</span>
              <span className="whea-summary-value">{result.rows.length}</span>
            </div>
            <div className="whea-summary-item">
              <span className="whea-summary-label">With HeaderLog</span>
              <span className="whea-summary-value">{result.withHeaderLog}</span>
            </div>
            <div className="whea-summary-item">
              <span className="whea-summary-label">Job</span>
              <span className="whea-summary-value whea-mono">{result.jobId}</span>
            </div>
          </section>
        )}

        {result && result.rows.length > 0 && (
          <div className="panel whea-table-wrap">
            <table className="whea-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Location / BDF</th>
                  <th>VID:DID</th>
                  <th>Key data</th>
                  <th>HeaderLog</th>
                  <th>TLP</th>
                  <th>Target</th>
                  <th>Decoded</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={`${row.recordId}-${row.eventId}-${row.time}`}>
                    <td className="whea-mono">{row.time}</td>
                    <td>{row.eventId}</td>
                    <td>{row.category}</td>
                    <td className="whea-mono">{row.location}</td>
                    <td className="whea-mono">{row.vidDid}</td>
                    <td>{row.keyData}</td>
                    <td className="whea-mono whea-clip">{row.headerLog}</td>
                    <td>{row.tlp}</td>
                    <td className="whea-mono">{row.target}</td>
                    <td className="whea-decoded">{row.decoded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="panel guide-section">
          <h2>使用說明</h2>
          <ol className="hint" style={{ paddingLeft: "1.25rem", lineHeight: 1.7 }}>
            <li>在本機以 Windows 事件檢視器匯出 <code>System.evtx</code>。</li>
            <li>拖曳或點擊上傳後按「開始分析」。</li>
            <li>結果顯示於摘要與表格；可下載與桌面版相同結構的 TXT / HTML。</li>
            <li>可選：下載 PowerShell GUI 於本機離線使用（需管理員）。</li>
          </ol>
          <p style={{ marginTop: "0.75rem" }}>
            <a className="btn" href={SCRIPT_HREF} download={SCRIPT_NAME}>
              下載桌面版 {SCRIPT_NAME}
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
