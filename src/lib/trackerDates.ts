import type { TrackerRow, TrackerWave } from "./trackerTypes";

export function parseSlashDate(part: string, year: number): string {
  const text = part.trim();
  const full = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (full) {
    const y = Number(full[1]);
    const m = Number(full[2]);
    const d = Number(full[3]);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const short = text.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (short) {
    const m = Number(short[1]);
    const d = Number(short[2]);
    return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

export function parseDateRange(text: string, year: number): { start: string; end: string; note: string } {
  const raw = (text ?? "").replace(/\u00a0/g, " ").trim();
  if (!raw) return { start: "", end: "", note: "" };
  const match = raw.match(/(\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,2})?)\s*[~\-–]\s*(\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,2})?)/);
  if (!match) return { start: "", end: "", note: raw };
  return {
    start: parseSlashDate(match[1], year),
    end: parseSlashDate(match[2], year),
    note: raw.slice(match.index! + match[0].length).replace(/^[\s\n()]+|[\s\n()]+$/g, ""),
  };
}

export function parseReleaseValue(value: unknown, year: number): { date: string; note: string } {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return { date: `${y}-${m}-${d}`, note: "" };
  }
  if (typeof value === "number") {
    const excel = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(excel.getTime())) return parseReleaseValue(excel, year);
  }
  const raw = String(value ?? "").replace(/\u00a0/g, " ").trim();
  if (!raw) return { date: "", note: "" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw, note: "" };
  const chunks = raw.split(/(?:->|>)+/);
  const last = chunks[chunks.length - 1].split(/[\n(]/, 1)[0];
  const date = parseSlashDate(last.trim(), year);
  return { date, note: raw !== date ? raw : "" };
}

export function rowSchedule(row: TrackerRow, waves: TrackerWave[]): { start: string; end: string } | null {
  if (row.testStart && row.testEnd) return { start: row.testStart, end: row.testEnd };
  if (row.testStart) return { start: row.testStart, end: row.testStart };
  if (row.saPre) return { start: row.saPre, end: row.testEnd || row.saPre };
  const wave = waves.find((item) => item.name === row.wave);
  if (wave?.start && wave.end) return { start: wave.start, end: wave.end };
  if (row.release) return { start: row.release, end: row.release };
  return null;
}

export function hasBiosVersion(bios: string): boolean {
  const raw = bios.replace(/\s+/g, "");
  if (!raw || /^(n\/?a|-|—|–|tbd|none|null|no)$/i.test(raw)) return false;
  return /\d/.test(raw);
}

export function releaseVsWave(row: TrackerRow, waves: TrackerWave[]): "ok" | "late" | "" {
  if (!hasBiosVersion(row.bios) || !row.release) return "";
  const wave = waves.find((item) => item.name === row.wave);
  if (!wave?.end) return "";
  if (row.release > wave.end) return "late";
  if (!wave.start || row.release >= wave.start) return "ok";
  return "";
}

export function waveClass(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (key.includes("4-2") || key.includes("4_2")) return "wave42";
  if (key.includes("wave1") || key === "1") return "wave1";
  if (key.includes("wave2") || key === "2") return "wave2";
  if (key.includes("wave3") || key === "3") return "wave3";
  if (key.includes("wave5") || key === "5") return "wave5";
  if (key.includes("wave4") || key === "4") return "wave4";
  return "wave0";
}
