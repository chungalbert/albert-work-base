import type { WheaAnalyzeResult, WheaRow } from "./types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 15);
}

function rowTxt(i: number, row: WheaRow): string[] {
  const lines = [
    "=".repeat(110),
    `[${String(i).padStart(4, "0")}] ${row.time}   WHEA Event ID ${row.eventId}   ${row.levelName}   Record ${row.recordId}`,
    "-".repeat(110),
    `Category                   : ${row.category}`,
    `Location / BDF             : ${row.location}`,
    `Key Data                   : ${row.keyData}`,
  ];
  if (row.category === "PCIe AER") {
    lines.push(
      `WHEA BDF                  : ${row.location}`,
      `Vendor / Device           : ${row.vendorId} / ${row.deviceId}`,
      `PrimaryDeviceName         : ${row.primaryDevice}`,
      `Uncorrectable Error Status: ${row.ues}`,
      `Correctable Error Status  : ${row.ces}`,
      `HeaderLog (Raw)           : ${row.headerLog}`,
    );
    if (row.headerLog && row.headerLog !== "N/A") {
      lines.push(
        `TLP DWORDs                : ${row.headerDwords}`,
        `TLP Command               : ${row.tlp}`,
        `Requester                 : ${row.requester}`,
        `Requester (ARI)           : ${row.requesterAri}`,
        `Target                    : ${row.target}`,
        `Target (ARI)              : ${row.targetAri}`,
        `Config Offset             : ${row.configOffset}`,
      );
    }
  } else if (row.category === "Processor MCA/MCE") {
    lines.push(
      `APIC ID                   : ${row.apicId}`,
      `MCA Bank                  : ${row.mcaBank}`,
      `MCi_STATUS                : ${row.mciStat}`,
      `MCA_CODE                  : ${row.mciMcaCode}`,
      `ExtCode[21:16]            : ${row.mciExtCode}`,
      `Common MCA Flags          : ${row.mciFlags}`,
      `MCi_ADDR                  : ${row.mciAddr}`,
      `MCi_MISC                  : ${row.mciMisc}`,
      `ErrorSource / ErrorType   : ${row.errorSource} / ${row.errorType}`,
    );
  } else if (row.category === "Memory") {
    lines.push(
      `PhysicalAddress            : ${row.physicalAddress}`,
      `PhysicalAddressMask        : ${row.physicalAddressMask}`,
      `Node / Card / Module       : ${row.node} / ${row.card} / ${row.module}`,
      `Bank / Device              : ${row.memoryBank} / ${row.memoryDevice}`,
      `Row / Column / BitPosition : ${row.row} / ${row.column} / ${row.bitPosition}`,
      `ErrorSource / ErrorType    : ${row.errorSource} / ${row.errorType}`,
    );
  } else if (row.category === "Firmware / CPER") {
    lines.push(
      `RawData Signature          : ${row.rawDataSignature}`,
      `RawData Bytes              : ${row.rawDataBytes}`,
      `RawData                    : ${row.rawData}`,
    );
  } else {
    lines.push(`ErrorSource / ErrorType    : ${row.errorSource} / ${row.errorType}`);
    if (row.eventMessage) lines.push(`Message                    : ${row.eventMessage}`);
  }
  lines.push("", ">>> 解讀 / Interpretation <<<", row.decoded, "");
  return lines;
}

export function buildTxtReport(result: WheaAnalyzeResult): string {
  const lines = [
    "================================================================================",
    "WHEA Hardware Analyzer (KSSW online) v1.3.1-port",
    "================================================================================",
    `Source EVTX : ${result.sourceName}`,
    `Generated   : ${new Date().toISOString()}`,
    `Job         : ${result.jobId}`,
    `Scanned     : ${result.scanned}`,
    `WHEA Events : ${result.rows.length}`,
    "",
  ];
  result.rows.forEach((row, i) => lines.push(...rowTxt(i + 1, row)));
  lines.push("=".repeat(110), "版權所有 Compal KS SW / KSSW online port", "=".repeat(110));
  return lines.join("\n");
}

export function buildHtmlReport(result: WheaAnalyzeResult): string {
  const events = result.rows
    .map((row, i) => {
      const badge =
        row.category === "PCIe AER" ? ""
          : row.category === "Processor MCA/MCE" ? " cpu"
            : row.category === "Memory" ? " mem"
              : row.category === "Firmware / CPER" ? " fw" : "";
      return `<div class="event">
        <div class="event-head">[${String(i + 1).padStart(4, "0")}] ${esc(row.time)} · Event ${esc(row.eventId)} · ${esc(row.levelName)}
          <span class="badge${badge}">${esc(row.category)}</span></div>
        <div class="grid">
          <div class="k">Location / BDF</div><div class="v">${esc(row.location)}</div>
          <div class="k">VID:DID</div><div class="v">${esc(row.vidDid)}</div>
          <div class="k">Key data</div><div class="v">${esc(row.keyData)}</div>
          <div class="k">HeaderLog</div><div class="v">${esc(row.headerLog)}</div>
          <div class="k">TLP</div><div class="v">${esc(row.tlp)}</div>
          <div class="k">Target</div><div class="v">${esc(row.target)}</div>
        </div>
        <div class="decode"><div class="decode-title">解讀 / Decoded</div><div class="decode-text">${esc(row.decoded)}</div></div>
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>WHEA Hardware Report</title>
<style>
body{font-family:Segoe UI,Microsoft JhengHei,Arial,sans-serif;margin:24px;background:#f4f6f8;color:#202428}
.page{max-width:1500px;margin:auto}.header,.event{background:#fff;border:1px solid #d8dde3;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.header{padding:18px 22px;margin-bottom:18px}.title{font-size:26px;font-weight:700}
.meta{font-size:13px;color:#5d6772;line-height:1.7;word-break:break-all}
.event{margin:16px 0;overflow:hidden}.event-head{background:#eef3f8;padding:11px 16px;font-weight:700;border-bottom:1px solid #d8dde3}
.badge{display:inline-block;border-radius:5px;padding:3px 8px;font-weight:700;margin-left:8px;background:#0d6efd;color:#fff}
.badge.cpu{background:#6f42c1}.badge.mem{background:#198754}.badge.fw{background:#6c757d}
.grid{display:grid;grid-template-columns:230px minmax(0,1fr)}.k,.v{padding:8px 12px;border-bottom:1px solid #edf0f2}
.k{font-weight:600;background:#fafbfc;color:#3c4651}.v{font-family:Consolas,Courier New,monospace;word-break:break-all}
.decode{margin:16px;border:3px solid #e0a800;background:#fff3bf;border-radius:8px;padding:14px 16px}
.decode-title{font-size:17px;font-weight:800;color:#7a5200;margin-bottom:7px}
.decode-text{font-size:15px;font-weight:700;line-height:1.65;color:#3d2d00;word-break:break-word}
.footer{text-align:center;margin:28px 0 8px;color:#59636e;font-size:13px;font-weight:600}
</style></head><body><div class="page">
<div class="header"><div class="title">WHEA Hardware Report</div>
<div class="meta">Source: ${esc(result.sourceName)}<br/>Job: ${esc(result.jobId)}<br/>Events: ${result.rows.length} · With HeaderLog: ${result.withHeaderLog}<br/>Generated: ${esc(new Date().toISOString())}</div></div>
${events}
<div class="footer">版權所有 Compal KS SW / KSSW online port</div>
</div></body></html>`;
}

export function downloadTxt(result: WheaAnalyzeResult) {
  downloadBlob(`WHEA_Hardware_Report_${stamp()}.txt`, buildTxtReport(result), "text/plain;charset=utf-8");
}

export function downloadHtml(result: WheaAnalyzeResult) {
  downloadBlob(`WHEA_Hardware_Report_${stamp()}.html`, buildHtmlReport(result), "text/html;charset=utf-8");
}
