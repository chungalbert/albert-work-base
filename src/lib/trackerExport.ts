import ExcelJS from "exceljs";
import { pmName, type TrackerCampaign, type TrackerRow, type TrackerWave } from "./trackerTypes";
import { releaseVsWave } from "./trackerDates";

const HEADER = "FF92CDDC";
const ISSUE = "FFF8CBAD";
const NO_ROW = "FFBFBFBF";
const YES = "FFC6EFCE";
const OK = "FF92D050";
const LATE = "FFFF6B6B";
const EMPTY = "FFF4B183";
const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const WIDTHS = [8.5, 3.5, 30.7, 13.5, 6.2, 6, 21.8, 15, 13, 6, 10.3, 19.3, 10.2, 9.2, 17, 14.3, 13.2, 10.5, 25.3, 25.3, 10.5];

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function isoDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function slash(value: string): string {
  const date = isoDate(value);
  return date ? `${date.getMonth() + 1}/${date.getDate()}` : value;
}

function testSchedule(row: TrackerRow): string {
  if (row.testStart && row.testEnd) {
    const span = `${slash(row.testStart)}~${slash(row.testEnd)}`;
    return row.testNote ? `${span}${row.testNote}` : span;
  }
  return row.testNote;
}

function waveSpan(wave: TrackerWave): string {
  if (wave.start && wave.end) return `${slash(wave.start)}-${slash(wave.end)}`;
  return [wave.start, wave.end].filter(Boolean).join("-");
}

function sheetName(title: string): string {
  const raw = /ipu4/i.test(title) ? "2026 IPU4 BIOS Tracking table" : title || "Tracking";
  return raw.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "Tracking";
}

function paint(cell: ExcelJS.Cell, value: ExcelJS.CellValue, opts?: {
  fill?: string;
  bold?: boolean;
  size?: number;
  color?: string;
  wrap?: boolean;
  align?: ExcelJS.Alignment["horizontal"];
  valign?: ExcelJS.Alignment["vertical"];
  numFmt?: string;
  underline?: boolean;
}) {
  cell.value = value;
  cell.border = BORDER;
  cell.font = {
    name: "Calibri",
    size: opts?.size ?? 8,
    bold: opts?.bold,
    underline: opts?.underline,
    color: opts?.color ? { argb: opts.color } : { argb: "FF000000" },
  };
  cell.alignment = {
    horizontal: opts?.align ?? "center",
    vertical: opts?.valign ?? "middle",
    wrapText: opts?.wrap ?? true,
  };
  if (opts?.fill) cell.fill = fill(opts.fill);
  if (opts?.numFmt) cell.numFmt = opts.numFmt;
}

function dateTone(value: string, state: "ok" | "late" | ""): string | undefined {
  if (!value) return EMPTY;
  if (state === "late") return LATE;
  if (state === "ok") return OK;
  return undefined;
}

export async function exportCampaignXlsx(campaign: TrackerCampaign): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Albert 工作基地";
  const ws = wb.addWorksheet(sheetName(campaign.title), {
    views: [{ state: "frozen", xSplit: 6, ySplit: 3, zoomScale: 85, showGridLines: true }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: false },
  });

  WIDTHS.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });
  campaign.issues.forEach((_, index) => {
    ws.getColumn(22 + index).width = 13.3;
  });

  ws.getRow(1).height = 38;
  ws.getRow(2).height = 90;
  ws.getRow(3).height = 21;

  const title = ws.getCell("C1");
  title.value = campaign.title;
  title.font = { name: "Calibri", size: 11, bold: true };
  title.alignment = { vertical: "middle" };

  const note = ws.getCell("J1");
  note.value = {
    richText: [
      { text: "Note:    " },
      {
        font: { bold: true, italic: true, size: 11, color: { argb: "FFFF0000" }, name: "Calibri" },
        text: campaign.note || "New Projects affected, you can add it in bottom \"C\" ; do not delete existed projects, you can update it with \"not affected\"",
      },
    ],
  };
  note.alignment = { vertical: "middle", wrapText: true };

  const top = ["SPMS", "No.", "Product Name", "", "ODM", "IBV", "Platform", "MT Code", "EOL"];
  top.forEach((label, index) => {
    if (!label) return;
    paint(ws.getCell(2, index + 1), label, { fill: HEADER, bold: true, size: index === 0 ? 10 : 9 });
  });
  paint(ws.getCell(2, 10), `${campaign.year || 2026} IPU4 Security BIOS update`, { fill: HEADER, bold: true, size: 9 });
  paint(ws.getCell(2, 16), "System Process", { fill: HEADER, bold: true, size: 9 });
  paint(ws.getCell(2, 18), "Owner", { fill: HEADER, bold: true, size: 9 });
  ws.mergeCells(2, 10, 2, 15);
  ws.mergeCells(2, 16, 2, 17);
  ws.mergeCells(2, 18, 2, 21);

  const subs = [
    [10, "Affected"],
    [11, "BIOS Version"],
    [12, "Release date"],
    [13, "Wave"],
    [14, "SA Pre-test\nSchedule"],
    [15, "Test Schedule"],
    [16, "ECRB"],
    [17, "Sign off"],
    [18, "Owner"],
    [19, "BIOS Owner"],
    [20, "DQA Owner"],
    [21, "SA Owner"],
  ] as const;
  subs.forEach(([col, label]) => {
    paint(ws.getCell(3, col), label, { fill: HEADER, bold: true, size: 8 });
  });

  campaign.issues.forEach((issue, index) => {
    const col = 22 + index;
    paint(ws.getCell(2, col), issue.title, { fill: ISSUE, size: 8, align: "left" });
    paint(ws.getCell(3, col), "Impact(Yes) / (No)", { fill: ISSUE, size: 8 });
  });

  campaign.rows.forEach((row, index) => {
    const r = 4 + index;
    ws.getRow(r).height = 15;
    const gray = row.affected === "NO" ? NO_ROW : undefined;
    const state = releaseVsWave(row, campaign.waves);
    const values: Array<{ col: number; value: ExcelJS.CellValue; fill?: string; align?: ExcelJS.Alignment["horizontal"]; size?: number; color?: string; underline?: boolean; numFmt?: string }> = [
      { col: 2, value: index + 1, fill: gray },
      { col: 3, value: row.product, fill: gray, align: "left" },
      { col: 4, value: row.code, fill: gray },
      { col: 5, value: row.odm, fill: gray, align: "left" },
      { col: 6, value: row.ibv, fill: gray, align: "left" },
      { col: 7, value: row.platform, fill: gray, align: "left" },
      { col: 8, value: row.mt, fill: gray, align: "left" },
      { col: 9, value: row.eol, fill: gray, align: "left" },
      { col: 10, value: row.affected, fill: row.affected === "YES" ? YES : row.affected === "NO" ? NO_ROW : row.affected ? EMPTY : gray },
      { col: 11, value: row.bios, fill: gray },
      { col: 12, value: isoDate(row.release) ?? row.releaseNote ?? "", fill: dateTone(row.release, state), numFmt: "mm-dd-yy" },
      { col: 13, value: row.wave, fill: gray },
      { col: 14, value: isoDate(row.saPre) ?? "", fill: row.saPre ? gray : EMPTY, numFmt: "mm-dd-yy" },
      { col: 15, value: testSchedule(row), fill: row.testStart || row.testEnd ? gray : EMPTY },
      { col: 16, value: row.ecrb, fill: gray },
      { col: 17, value: row.signoff, fill: gray },
      { col: 18, value: pmName(row), fill: gray },
      { col: 19, value: row.biosOwner, fill: gray, align: "left" },
      { col: 20, value: row.dqaOwner, fill: gray },
      { col: 21, value: row.saOwner, fill: gray },
    ];

    const a = ws.getCell(r, 1);
    if (row.spms.startsWith("http")) {
      paint(a, { text: row.spms, hyperlink: row.spms }, { fill: gray, size: 6, color: "FF0000FF", underline: true, align: "right" });
    } else {
      paint(a, row.spms, { fill: gray, size: 6, align: "right" });
    }

    values.forEach((item) => {
      paint(ws.getCell(r, item.col), item.value, {
        fill: item.fill,
        align: item.align ?? "center",
        size: item.size ?? 8,
        color: item.color,
        underline: item.underline,
        numFmt: item.numFmt,
      });
    });

    campaign.issues.forEach((issue, issueIndex) => {
      const impact = row.impacts[issue.id] ?? "";
      paint(ws.getCell(r, 22 + issueIndex), impact, {
        fill: impact.toLowerCase() === "yes" ? YES : gray,
        size: 8,
      });
    });
  });

  const waveStart = 4 + campaign.rows.length + 2;
  campaign.waves.forEach((wave, index) => {
    const r = waveStart + index;
    ws.getRow(r).height = 15.75;
    const count = campaign.rows.filter((row) => row.wave === wave.name).length;
    paint(ws.getCell(r, 9), wave.name, { size: 11, fill: wave.start && wave.end ? undefined : EMPTY });
    paint(ws.getCell(r, 11), count || "", { size: 11 });
    paint(ws.getCell(r, 12), waveSpan(wave), { size: 9, fill: wave.start && wave.end ? undefined : EMPTY });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
