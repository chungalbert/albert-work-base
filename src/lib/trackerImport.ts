import * as XLSX from "xlsx";
import { parseDateRange, parseReleaseValue } from "./trackerDates";
import { emptyRow, emptyWave, type TrackerCampaign, type TrackerIssue, type TrackerRow, type TrackerWave } from "./trackerTypes";

function cell(sheet: XLSX.WorkSheet, r: number, c: number): unknown {
  return sheet[XLSX.utils.encode_cell({ r, c })]?.v;
}

function text(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const value = cell(sheet, r, c);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").trim();
}

function personName(value: string): string {
  const raw = value.replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (/26h2|\bosr\b/i.test(raw) && !/[_a-z]{2,}/i.test(raw.replace(/26h2|osr/ig, ""))) return "";
  return raw;
}

function issueId(title: string): string {
  const match = title.match(/LEN[-\s]?\d+/i);
  return match ? match[0].replace(/\s/g, "").toUpperCase() : title.replace(/\W+/g, "-").slice(0, 24);
}

function findHeader(sheet: XLSX.WorkSheet): { header: number; sub: number; cols: Record<string, number>; issues: { col: number; issue: TrackerIssue }[] } | null {
  const ref = sheet["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= Math.min(range.e.r, 12); r += 1) {
    let product = -1;
    let wave = -1;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const value = text(sheet, r, c).toLowerCase();
      if (value === "product name" || value === "產品" || value.includes("product name")) product = c;
      if (value === "wave") wave = c;
    }
    if (product >= 0 && wave < 0) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        if (text(sheet, r + 1, c).toLowerCase() === "wave") wave = c;
      }
    }
    if (product < 0 || wave < 0) continue;
    let issueStart = range.e.c + 1;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      if (/LEN[-\s]?\d+/i.test(text(sheet, r, c))) {
        issueStart = c;
        break;
      }
    }
    const cols: Record<string, number> = { product, wave };
    for (let c = range.s.c; c < issueStart; c += 1) {
      const top = text(sheet, r, c).toLowerCase();
      const sub = text(sheet, r + 1, c).toLowerCase();
      if (top.includes("spms")) cols.spms = c;
      if (top === "no." || top === "no") cols.no = c;
      if (top === "odm") cols.odm = c;
      if (top === "ibv") cols.ibv = c;
      if (top === "platform" || top.startsWith("platform ")) cols.platform = c;
      if (top === "mt" || top === "mt code" || top.startsWith("mt ")) cols.mt = c;
      if (top === "eol") cols.eol = c;
      if ((top === "owner" || top === "pm") && cols.owner == null) cols.owner = c;
      if (sub === "pm" || sub.includes("pm owner") || top === "pm") cols.pmOwner = c;
      if (sub.includes("affected")) cols.affected = c;
      if (sub.includes("bios owner")) cols.biosOwner = c;
      else if (sub.includes("bios")) cols.bios = c;
      if (sub.includes("release")) cols.release = c;
      if (sub.includes("pre-test") || sub.includes("pretest")) cols.saPre = c;
      if (sub.includes("test schedule")) cols.test = c;
      if (sub === "ecrb") cols.ecrb = c;
      if (sub.includes("sign")) cols.signoff = c;
      if (sub.includes("dqa")) cols.dqaOwner = c;
      if (sub.includes("sa owner")) cols.saOwner = c;
    }
    if (cols.code == null && product + 1 !== wave) cols.code = product + 1;
    const issues: { col: number; issue: TrackerIssue }[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const title = text(sheet, r, c);
      if (/LEN[-\s]?\d+/i.test(title)) {
        issues.push({ col: c, issue: { id: issueId(title), title: title.replace(/\s+/g, " ") } });
      }
    }
    return { header: r, sub: r + 1, cols, issues };
  }
  return null;
}

function rowKey(row: TrackerRow): string {
  const spms = row.spms.match(/id=(\d+)/i);
  if (spms) return `spms-${spms[1]}`;
  const mt = row.mt.replace(/\s+/g, "").toLowerCase();
  const product = row.product.replace(/\s+/g, "").toLowerCase();
  return `${mt}|${product}`;
}

function mergeKey(row: TrackerRow): string {
  const mt = row.mt.replace(/\s+/g, "").toLowerCase();
  return mt ? `${rowKey(row)}|${mt}` : rowKey(row);
}

function uniquifyRowIds(rows: TrackerRow[]) {
  const groups = new Map<string, TrackerRow[]>();
  rows.forEach((row) => {
    const list = groups.get(row.id) ?? [];
    list.push(row);
    groups.set(row.id, list);
  });
  groups.forEach((list) => {
    if (list.length < 2) return;
    list.forEach((row) => {
      const extra = row.mt.replace(/\s+/g, "").toLowerCase() || row.code.replace(/\s+/g, "").toLowerCase();
      if (extra) row.id = `${row.id}-${extra}`;
    });
  });
}

function mergeRow(prev: TrackerRow, incoming: TrackerRow): TrackerRow {
  const next = { ...prev };
  (Object.keys(incoming) as (keyof TrackerRow)[]).forEach((key) => {
    if (key === "id" || key === "impacts") return;
    const value = incoming[key];
    if (typeof value === "string" && value.trim()) (next as Record<string, unknown>)[key] = value;
  });
  next.impacts = { ...prev.impacts, ...Object.fromEntries(Object.entries(incoming.impacts).filter(([, value]) => value)) };
  return next;
}

function parseSheet(sheet: XLSX.WorkSheet, fileName: string): TrackerCampaign | null {
  const found = findHeader(sheet);
  if (!found) return null;
  const { cols, issues, sub } = found;
  const ref = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const titleHint = text(sheet, 0, 2) || text(sheet, 0, 0) || fileName;
  const year = Number(titleHint.match(/20\d{2}/)?.[0] ?? new Date().getFullYear());
  const rows: TrackerRow[] = [];
  const waves: TrackerWave[] = [];
  let empty = 0;
  for (let r = sub + 1; r <= ref.e.r; r += 1) {
    const product = cols.product != null ? text(sheet, r, cols.product) : "";
    const waveName = cols.wave != null ? text(sheet, r, cols.wave) : "";
    if (!product) {
      let calendar = waveName;
      let span = "";
      if (!/^wave/i.test(calendar)) {
        for (let c = ref.s.c; c <= ref.e.c; c += 1) {
          const value = text(sheet, r, c);
          if (/^wave/i.test(value)) {
            calendar = value;
            span = text(sheet, r, c + 3) || text(sheet, r, c + 2) || text(sheet, r, c + 1);
            break;
          }
        }
      }
      if (/^wave/i.test(calendar)) {
        const range = parseDateRange(span.replace(/(?<=\d)-(?=\d)/g, "~"), year);
        if (!waves.some((item) => item.name.toLowerCase() === calendar.toLowerCase())) {
          waves.push(emptyWave(calendar, range.start, range.end));
        }
      }
      empty += 1;
      if (empty > 8 && rows.length) break;
      continue;
    }
    empty = 0;
    const release = parseReleaseValue(cell(sheet, r, cols.release ?? -1), year);
    const test = parseDateRange(cols.test != null ? text(sheet, r, cols.test) : "", year);
    const sa = parseReleaseValue(cell(sheet, r, cols.saPre ?? -1), year);
    const impacts: Record<string, string> = {};
    issues.forEach((item) => {
      const value = text(sheet, r, item.col).replace(/\u3000/g, "").trim();
      if (value) impacts[item.issue.id] = value;
    });
    const row = emptyRow({
      spms: cols.spms != null ? text(sheet, r, cols.spms) : "",
      no: cols.no != null ? text(sheet, r, cols.no) : "",
      product,
      code: cols.code != null ? text(sheet, r, cols.code) : "",
      odm: cols.odm != null ? text(sheet, r, cols.odm) : "",
      ibv: cols.ibv != null ? text(sheet, r, cols.ibv) : "",
      platform: cols.platform != null ? text(sheet, r, cols.platform) : "",
      mt: cols.mt != null ? text(sheet, r, cols.mt) : "",
      eol: cols.eol != null ? text(sheet, r, cols.eol) : "",
      affected: (cols.affected != null ? text(sheet, r, cols.affected) : "").toUpperCase(),
      bios: cols.bios != null ? text(sheet, r, cols.bios) : "",
      release: release.date,
      releaseNote: release.note,
      wave: waveName,
      saPre: sa.date,
      testStart: test.start,
      testEnd: test.end,
      testNote: test.note,
      ecrb: cols.ecrb != null ? text(sheet, r, cols.ecrb) : "",
      signoff: cols.signoff != null ? text(sheet, r, cols.signoff) : "",
      owner: cols.owner != null ? text(sheet, r, cols.owner) : "",
      pmOwner: (cols.pmOwner != null ? text(sheet, r, cols.pmOwner) : "")
        || (cols.owner != null ? text(sheet, r, cols.owner) : ""),
      biosOwner: cols.biosOwner != null ? text(sheet, r, cols.biosOwner).replace(/\n/g, "/") : "",
      dqaOwner: personName(cols.dqaOwner != null ? text(sheet, r, cols.dqaOwner) : ""),
      saOwner: cols.saOwner != null ? text(sheet, r, cols.saOwner) : "",
      impacts,
    });
    row.id = rowKey(row);
    rows.push(row);
  }
  uniquifyRowIds(rows);
  if (rows.length === 0) return null;
  const titleCell = text(sheet, 0, 2) || text(sheet, 0, 0) || fileName.replace(/\.xlsx?$/i, "");
  return {
    id: crypto.randomUUID(),
    title: titleCell.replace(/\s+/g, " ").slice(0, 80) || fileName,
    note: "匯入後可直接改 Wave、日期與欄位；再匯入同一份表會合併、不會刪舊專案。",
    year,
    deadline: `${year}-10-25`,
    waves: waves.length ? waves : [],
    issues: issues.map((item) => item.issue),
    rows,
    updatedAt: new Date().toISOString(),
  };
}

export function parseTrackerWorkbook(buffer: ArrayBuffer, fileName: string): TrackerCampaign {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  for (const name of wb.SheetNames) {
    const campaign = parseSheet(wb.Sheets[name], fileName);
    if (campaign) {
      if (!campaign.title || campaign.title === fileName) campaign.title = name;
      return campaign;
    }
  }
  throw new Error("找不到追蹤表。請確認有 Product Name 與 Wave 欄。");
}

export function mergeCampaigns(current: TrackerCampaign, incoming: TrackerCampaign): TrackerCampaign {
  const map = new Map(current.rows.map((row) => [mergeKey(row), row]));
  incoming.rows.forEach((row) => {
    const key = mergeKey(row);
    const prev = map.get(key);
    map.set(key, prev ? mergeRow(prev, row) : row);
  });
  const waves = [...current.waves];
  incoming.waves.forEach((wave) => {
    const index = waves.findIndex((item) => item.name.toLowerCase() === wave.name.toLowerCase());
    if (index >= 0) {
      waves[index] = {
        ...waves[index],
        start: wave.start || waves[index].start,
        end: wave.end || waves[index].end,
      };
    } else waves.push(wave);
  });
  const issues = [...current.issues];
  incoming.issues.forEach((issue) => {
    if (!issues.some((item) => item.id === issue.id)) issues.push(issue);
  });
  return {
    ...current,
    title: incoming.title || current.title,
    year: incoming.year || current.year,
    deadline: current.deadline || incoming.deadline || `${incoming.year || current.year || 2026}-10-25`,
    waves,
    issues,
    rows: [...map.values()],
    updatedAt: new Date().toISOString(),
  };
}
