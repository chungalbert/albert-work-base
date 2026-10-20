import { decodePcieHeaderLog } from "./pcieDecode";
import type { WheaRow } from "./types";
import { formatHexValue, getDataValue, toUInt64Safe } from "./util";

function decodeMciStatus(value: string): {
  valid: boolean;
  value: string;
  mcaCode: string;
  extCode: string;
  flags: string;
} {
  const v = toUInt64Safe(value);
  if (v == null) return { valid: false, value: "", mcaCode: "", extCode: "", flags: "" };
  const flags = [
    { bit: 63n, name: "VAL" },
    { bit: 62n, name: "OVER" },
    { bit: 61n, name: "UC" },
    { bit: 60n, name: "EN" },
    { bit: 59n, name: "MISCV" },
    { bit: 58n, name: "ADDRV" },
    { bit: 57n, name: "PCC" },
  ].map((f) => `${f.name}=${(v >> f.bit) & 1n}`);
  return {
    valid: true,
    value: `0x${v.toString(16).toUpperCase().padStart(16, "0")}`,
    mcaCode: `0x${(v & 0xffffn).toString(16).toUpperCase().padStart(4, "0")}`,
    extCode: `0x${((v >> 16n) & 0x3fn).toString(16).toUpperCase().padStart(2, "0")}`,
    flags: flags.join(", "),
  };
}

function rawDataInfo(rawData: string): { hasData: boolean; byteLength: number; signature: string } {
  const hex = (rawData || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length < 2) return { hasData: false, byteLength: 0, signature: "" };
  return {
    hasData: true,
    byteLength: Math.floor(hex.length / 2),
    signature: hex.startsWith("43504552") ? "CPER" : "RawData",
  };
}

export function getWheaCategory(eventId: number, data: Record<string, string>, message: string): string {
  if (
    Object.prototype.hasOwnProperty.call(data, "HeaderLog") ||
    (
      Object.prototype.hasOwnProperty.call(data, "Bus") &&
      Object.prototype.hasOwnProperty.call(data, "Device") &&
      Object.prototype.hasOwnProperty.call(data, "Function") &&
      (Object.prototype.hasOwnProperty.call(data, "VendorID") || Object.prototype.hasOwnProperty.call(data, "DeviceID"))
    )
  ) {
    return "PCIe AER";
  }
  if (
    ["MciStat", "MciStatus", "MCABank", "McaBank", "ApicId"].some((k) => Object.prototype.hasOwnProperty.call(data, k)) ||
    /Machine Check|Processor Core|Cache Hierarchy|Bus\/Interconnect/i.test(message)
  ) {
    return "Processor MCA/MCE";
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "PhysicalAddress") ||
    Object.prototype.hasOwnProperty.call(data, "PhysicalAddressMask") ||
    ((Object.prototype.hasOwnProperty.call(data, "Row") || Object.prototype.hasOwnProperty.call(data, "Column") || Object.prototype.hasOwnProperty.call(data, "Module")) &&
      /memory/i.test(message))
  ) {
    return "Memory";
  }
  const raw = getDataValue(data, ["RawData"]);
  const hex = raw.replace(/[^0-9A-Fa-f]/g, "");
  if (eventId === 1 || (/^43504552/i.test(hex))) return "Firmware / CPER";
  return "Other WHEA";
}

export function analyzeWheaEvent(input: {
  time: Date | string;
  eventId: number;
  recordId: string | number | bigint;
  level: number;
  levelName?: string;
  message?: string;
  data: Record<string, string>;
}): WheaRow {
  const data = input.data;
  const message = (input.message ?? "").replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ").trim();
  const category = getWheaCategory(input.eventId, data, message);
  const levelName = input.levelName?.trim() || `Level ${input.level}`;
  const errorSource = getDataValue(data, ["ErrorSource"]);
  const errorType = getDataValue(data, ["ErrorType"]);
  const headerLog = getDataValue(data, ["HeaderLog"]);

  const bus = Object.prototype.hasOwnProperty.call(data, "Bus") ? toUInt64Safe(data.Bus) : null;
  const dev = Object.prototype.hasOwnProperty.call(data, "Device") ? toUInt64Safe(data.Device) : null;
  const fun = Object.prototype.hasOwnProperty.call(data, "Function") ? toUInt64Safe(data.Function) : null;
  const seg = Object.prototype.hasOwnProperty.call(data, "Segment") ? toUInt64Safe(data.Segment) ?? 0n : 0n;
  let bdf = "N/A";
  if (bus != null && dev != null && fun != null) {
    bdf = `${seg.toString(16).toUpperCase().padStart(4, "0")}:${bus.toString(16).toUpperCase().padStart(2, "0")}:${dev.toString(16).toUpperCase().padStart(2, "0")}.${fun.toString(16).toUpperCase()}`;
  }

  const vendorId = Object.prototype.hasOwnProperty.call(data, "VendorID") ? formatHexValue(data.VendorID, 4) : "N/A";
  const deviceId = Object.prototype.hasOwnProperty.call(data, "DeviceID") ? formatHexValue(data.DeviceID, 4) : "N/A";
  const primaryDevice = getDataValue(data, ["PrimaryDeviceName"], "N/A");
  const ues = Object.prototype.hasOwnProperty.call(data, "UncorrectableErrorStatus")
    ? formatHexValue(data.UncorrectableErrorStatus, 8)
    : "N/A";
  const ces = Object.prototype.hasOwnProperty.call(data, "CorrectableErrorStatus")
    ? formatHexValue(data.CorrectableErrorStatus, 8)
    : "N/A";
  const decoded = decodePcieHeaderLog(headerLog);

  const apicId = getDataValue(data, ["ApicId", "APICId", "ProcessorAPICId"]);
  const mcaBank = getDataValue(data, ["MCABank", "McaBank", "Bank"]);
  const mciStatRaw = getDataValue(data, ["MciStat", "MciStatus", "MCI_STATUS"]);
  const mciAddrRaw = getDataValue(data, ["MciAddr", "MCI_ADDR"]);
  const mciMiscRaw = getDataValue(data, ["MciMisc", "MCI_MISC"]);
  const mci = decodeMciStatus(mciStatRaw);

  const physicalAddress = getDataValue(data, ["PhysicalAddress"]);
  const physicalAddressMask = getDataValue(data, ["PhysicalAddressMask"]);
  const node = getDataValue(data, ["Node"]);
  const card = getDataValue(data, ["Card"]);
  const moduleName = getDataValue(data, ["Module"]);
  const memBank = getDataValue(data, ["Bank"]);
  const memDevice = getDataValue(data, ["Device"]);
  const rowValue = getDataValue(data, ["Row"]);
  const columnValue = getDataValue(data, ["Column"]);
  const bitPosition = getDataValue(data, ["BitPosition"]);
  const rawData = getDataValue(data, ["RawData"]);
  const rawInfo = rawDataInfo(rawData);

  let location = "N/A";
  if (category === "PCIe AER") location = bdf;
  else if (category === "Processor MCA/MCE") {
    const parts = [apicId && `APIC ${apicId}`, mcaBank && `Bank ${mcaBank}`].filter(Boolean);
    location = parts.length ? parts.join(" / ") : "Processor";
  } else if (category === "Memory") {
    location = physicalAddress ? `PA ${physicalAddress}` : node ? `Node ${node}` : "Memory";
  } else if (category === "Firmware / CPER") {
    location = rawInfo.signature === "CPER" ? "CPER" : "Firmware";
  } else location = "WHEA";

  const keyParts: string[] = [];
  if (category === "PCIe AER") {
    if (ues !== "N/A") keyParts.push(`UES=${ues}`);
    if (ces !== "N/A") keyParts.push(`CES=${ces}`);
    if (decoded.tlpType && decoded.tlpType !== "N/A") keyParts.push(`TLP=${decoded.tlpType}`);
  } else if (category === "Processor MCA/MCE") {
    if (mci.valid) keyParts.push(`MCi_STATUS=${mci.value}`);
    if (errorType) keyParts.push(`ErrorType=${errorType}`);
    if (mciAddrRaw) keyParts.push(`Addr=${mciAddrRaw}`);
  } else if (category === "Memory") {
    if (physicalAddress) keyParts.push(`PA=${physicalAddress}`);
    if (errorType) keyParts.push(`ErrorType=${errorType}`);
    if (moduleName) keyParts.push(`Module=${moduleName}`);
  } else if (category === "Firmware / CPER") {
    if (rawInfo.hasData) keyParts.push(`${rawInfo.signature}=${rawInfo.byteLength} bytes`);
  } else {
    if (errorSource) keyParts.push(`ErrorSource=${errorSource}`);
    if (errorType) keyParts.push(`ErrorType=${errorType}`);
  }
  const keyData = keyParts.length ? keyParts.join("; ") : "N/A";

  let summary = "";
  if (category === "PCIe AER") summary = decoded.summary;
  else if (category === "Processor MCA/MCE") {
    const parts = ["處理器 MCA/MCE"];
    if (apicId) parts.push(`APIC=${apicId}`);
    if (mcaBank) parts.push(`Bank=${mcaBank}`);
    if (mci.valid) {
      parts.push(`MCi_STATUS=${mci.value}`, `MCA_CODE=${mci.mcaCode}`, `ExtCode[21:16]=${mci.extCode}`, mci.flags);
    }
    if (errorType) parts.push(`ErrorType=${errorType}`);
    if (errorSource) parts.push(`ErrorSource=${errorSource}`);
    if (mciAddrRaw) parts.push(`MCi_ADDR=${mciAddrRaw}`);
    if (mciMiscRaw) parts.push(`MCi_MISC=${mciMiscRaw}`);
    parts.push("廠牌/CPU Family 專屬 syndrome 保留原始值，不做無依據推測。");
    summary = parts.join("；");
  } else if (category === "Memory") {
    const parts = ["記憶體 WHEA"];
    for (const [k, v] of [
      ["PhysicalAddress", physicalAddress],
      ["Mask", physicalAddressMask],
      ["Node", node],
      ["Card", card],
      ["Module", moduleName],
      ["Bank", memBank],
      ["Device", memDevice],
      ["Row", rowValue],
      ["Column", columnValue],
      ["BitPosition", bitPosition],
      ["ErrorType", errorType],
    ] as const) {
      if (v) parts.push(`${k}=${v}`);
    }
    summary = parts.join("；");
  } else if (category === "Firmware / CPER") {
    summary = rawInfo.hasData
      ? `Firmware/CPER WHEA 記錄；RawData=${rawInfo.byteLength} bytes；Signature=${rawInfo.signature}。保留原始 payload，供後續平台專屬解碼。`
      : "Firmware / CPER WHEA";
  } else {
    const parts = [errorSource && `ErrorSource=${errorSource}`, errorType && `ErrorType=${errorType}`, message].filter(Boolean) as string[];
    summary = parts.length ? parts.join("；") : "Other WHEA event";
  }

  const time =
    input.time instanceof Date
      ? input.time.toISOString().replace("T", " ").replace("Z", "")
      : String(input.time);

  return {
    time,
    eventId: input.eventId,
    recordId: String(input.recordId),
    levelName,
    category,
    location,
    vidDid: `${vendorId} / ${deviceId}`,
    keyData,
    headerLog: headerLog || "N/A",
    tlp: decoded.tlpType || "N/A",
    target: decoded.targetTraditional || "N/A",
    decoded: summary,
    vendorId,
    deviceId,
    primaryDevice,
    ues,
    ces,
    headerDwords: decoded.dwords || "",
    requester: decoded.requesterTraditional || "",
    requesterAri: decoded.requesterAri || "",
    targetAri: decoded.targetAri || "",
    configOffset: decoded.configOffset || "",
    address: decoded.address || "",
    eventMessage: message,
    errorSource,
    errorType,
    apicId,
    mcaBank,
    mciStat: mci.valid ? mci.value : mciStatRaw,
    mciMcaCode: mci.mcaCode,
    mciExtCode: mci.extCode,
    mciFlags: mci.flags,
    mciAddr: mciAddrRaw,
    mciMisc: mciMiscRaw,
    physicalAddress,
    physicalAddressMask,
    node,
    card,
    module: moduleName,
    memoryBank: memBank,
    memoryDevice: memDevice,
    row: rowValue,
    column: columnValue,
    bitPosition,
    rawData,
    rawDataBytes: rawInfo.byteLength,
    rawDataSignature: rawInfo.signature,
  };
}
