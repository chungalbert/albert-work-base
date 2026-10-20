import { EvtxFile } from "@ts-evtx/core/dist/src/evtx/EvtxFile.js";
import { analyzeWheaEvent } from "./analyze";
import type { WheaAnalyzeResult, WheaRow } from "./types";

const MAX_BYTES = 200 * 1024 * 1024;
/** PS1 targets WHEA-Logger in System.evtx; also accept Kernel-WHEA channels when present. */
const WHEA_PROVIDER = /Microsoft-Windows-WHEA-Logger|Microsoft-Windows-Kernel-WHEA/i;
const LEVEL_NAMES: Record<number, string> = {
  1: "Critical",
  2: "Error",
  3: "Warning",
  4: "Information",
  5: "Verbose",
};

function isWheaLevel(provider: string, level: number): boolean {
  if (/WHEA-Logger/i.test(provider)) return [1, 2, 3].includes(level);
  // Kernel-WHEA often logs useful payloads at Information (4).
  return [1, 2, 3, 4].includes(level);
}

function openFromBuffer(buffer: Uint8Array): EvtxFile {
  // Constructor accepts Uint8Array; package d.ts marks it private but runtime is public.
  return new (EvtxFile as unknown as { new (buf: Uint8Array): EvtxFile })(buffer);
}

function parseEventXml(xmlText: string): {
  provider: string;
  eventId: number;
  level: number;
  time: string;
  data: Record<string, string>;
} | null {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) return null;

  const provider =
    doc.querySelector("System > Provider")?.getAttribute("Name") ||
    doc.querySelector("Provider")?.getAttribute("Name") ||
    "";
  const eventId = Number(
    doc.querySelector("System > EventID")?.textContent ||
      doc.querySelector("EventID")?.textContent ||
      "0",
  );
  const level = Number(
    doc.querySelector("System > Level")?.textContent ||
      doc.querySelector("Level")?.textContent ||
      "0",
  );
  const time =
    doc.querySelector("System > TimeCreated")?.getAttribute("SystemTime") ||
    doc.querySelector("TimeCreated")?.getAttribute("SystemTime") ||
    "";

  const data: Record<string, string> = {};
  let idx = 0;
  doc.querySelectorAll("EventData > Data, UserData Data").forEach((node) => {
    const name = node.getAttribute("Name") || `Data${idx}`;
    data[name] = (node.textContent || "").trim();
    idx += 1;
  });

  return { provider, eventId, level, time, data };
}

/**
 * Parse uploaded System.evtx in-browser, filter WHEA-Logger Error/Warning/Critical,
 * and run PS1-ported analysis.
 */
export async function analyzeEvtxFile(file: File): Promise<WheaAnalyzeResult> {
  if (!/\.evtx$/i.test(file.name)) {
    throw new Error("請上傳 System.evtx（副檔名 .evtx）。");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("檔案超過 200MB 上限。");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  // ElfFile magic "ElfFile\0"
  const magic = String.fromCharCode(...buffer.slice(0, 7));
  if (magic !== "ElfFile") {
    throw new Error("不是有效的 EVTX 檔（缺少 ElfFile 標頭）。");
  }

  const jobId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
  let evtx: EvtxFile;
  try {
    evtx = openFromBuffer(buffer);
  } catch (err) {
    throw new Error(err instanceof Error ? `無法開啟 EVTX：${err.message}` : "無法開啟 EVTX。");
  }

  const rows: WheaRow[] = [];
  let scanned = 0;

  for (const record of evtx.records()) {
    scanned += 1;
    let xml = "";
    try {
      xml = record.renderXml();
    } catch {
      continue;
    }
    const parsed = parseEventXml(xml);
    if (!parsed) continue;
    if (!WHEA_PROVIDER.test(parsed.provider)) continue;
    if (!isWheaLevel(parsed.provider, parsed.level)) continue;

    const timeDate = parsed.time ? new Date(parsed.time) : record.timestampAsDate();
    rows.push(
      analyzeWheaEvent({
        time: Number.isNaN(timeDate.getTime()) ? parsed.time || record.timestampAsDate() : timeDate,
        eventId: parsed.eventId,
        recordId: record.recordNum(),
        level: parsed.level,
        levelName: LEVEL_NAMES[parsed.level],
        data: parsed.data,
      }),
    );
  }

  rows.sort((a, b) => a.time.localeCompare(b.time));

  return {
    sourceName: file.name,
    jobId,
    scanned,
    rows,
    withHeaderLog: rows.filter((r) => r.headerLog && r.headerLog !== "N/A").length,
  };
}
