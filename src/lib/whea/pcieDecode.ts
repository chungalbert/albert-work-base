import { formatRidAri, formatRidTraditional, reverseDwordHexBytes } from "./util";

export type TlpDecode = {
  valid: boolean;
  rawHeaderLog: string;
  rawDwords: string;
  dwords: string;
  tlpType: string;
  lengthDw: number | null;
  lengthBytes: number | null;
  requesterTraditional: string;
  requesterAri: string;
  targetTraditional: string;
  targetAri: string;
  configOffset: string;
  address: string;
  summary: string;
};

type TlpTypeInfo = { name: string; known: boolean; fmt: number; type: number };

function getTlpTypeInfo(dw0: number): TlpTypeInfo {
  const fmt = (dw0 >>> 29) & 0x7;
  const type = (dw0 >>> 24) & 0x1f;
  let name = "Unknown";
  let known = false;

  if (type === 0x00) {
    if (fmt === 0) { name = "MRd32"; known = true; }
    else if (fmt === 1) { name = "MRd64"; known = true; }
    else if (fmt === 2) { name = "MWr32"; known = true; }
    else if (fmt === 3) { name = "MWr64"; known = true; }
  } else if (type === 0x01) {
    if (fmt === 0) { name = "MRdLk32"; known = true; }
    else if (fmt === 1) { name = "MRdLk64"; known = true; }
  } else if (type === 0x02) {
    if (fmt === 0) { name = "IORd"; known = true; }
    else if (fmt === 2) { name = "IOWr"; known = true; }
  } else if (type === 0x04) {
    if (fmt === 0) { name = "CfgRd0"; known = true; }
    else if (fmt === 2) { name = "CfgWr0"; known = true; }
  } else if (type === 0x05) {
    if (fmt === 0) { name = "CfgRd1"; known = true; }
    else if (fmt === 2) { name = "CfgWr1"; known = true; }
  } else if (type === 0x0a) {
    if (fmt === 0) { name = "Cpl"; known = true; }
    else if (fmt === 2) { name = "CplD"; known = true; }
  } else if (type === 0x0b) {
    if (fmt === 0) { name = "CplLk"; known = true; }
    else if (fmt === 2) { name = "CplDLk"; known = true; }
  } else if (type >= 0x10 && type <= 0x17) {
    name = "Message";
    known = true;
  }

  return { name, known, fmt, type };
}

function emptyDecode(raw: string, summary: string): TlpDecode {
  return {
    valid: false,
    rawHeaderLog: raw,
    rawDwords: "",
    dwords: "",
    tlpType: "N/A",
    lengthDw: null,
    lengthBytes: null,
    requesterTraditional: "",
    requesterAri: "",
    targetTraditional: "",
    targetAri: "",
    configOffset: "",
    address: "",
    summary,
  };
}

/** Port of PS1 Decode-PcieHeaderLog (zh-TW summaries). */
export function decodePcieHeaderLog(headerLog: string): TlpDecode {
  if (!headerLog?.trim()) return emptyDecode(headerLog ?? "", "沒有 HeaderLog。");

  let hex = headerLog.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length < 32) return emptyDecode(headerLog, "HeaderLog 長度不足 16 bytes。");
  hex = hex.slice(0, 32);

  const rawChunks = [hex.slice(0, 8), hex.slice(8, 16), hex.slice(16, 24), hex.slice(24, 32)];
  const swapChunks = rawChunks.map(reverseDwordHexBytes);
  const directDw = rawChunks.map((c) => Number.parseInt(c, 16) >>> 0);
  const swapDw = swapChunks.map((c) => Number.parseInt(c, 16) >>> 0);
  const directType = getTlpTypeInfo(directDw[0]);
  const swapType = getTlpTypeInfo(swapDw[0]);

  const useSwap = swapType.known || !directType.known;
  const dw = useSwap ? swapDw : directDw;
  const typeInfo = useSwap ? swapType : directType;
  const dwordsStr = (useSwap ? swapChunks : rawChunks).map((c) => `0x${c}`).join(" ");

  let lenDw = dw[0] & 0x3ff;
  if (lenDw === 0) lenDw = 1024;

  const rid = (dw[1] >>> 16) & 0xffff;
  const ret: TlpDecode = {
    valid: true,
    rawHeaderLog: headerLog,
    rawDwords: rawChunks.join(" "),
    dwords: dwordsStr,
    tlpType: typeInfo.name,
    lengthDw: lenDw,
    lengthBytes: lenDw * 4,
    requesterTraditional: formatRidTraditional(rid),
    requesterAri: formatRidAri(rid),
    targetTraditional: "",
    targetAri: "",
    configOffset: "",
    address: "",
    summary: "",
  };

  const { fmt, type } = typeInfo;

  if (type === 0x04 || type === 0x05) {
    const bus = (dw[2] >>> 24) & 0xff;
    const dev = (dw[2] >>> 19) & 0x1f;
    const fun = (dw[2] >>> 16) & 0x07;
    const ariFunc = (dw[2] >>> 16) & 0xff;
    const extReg = (dw[2] >>> 8) & 0x0f;
    const regNum = (dw[2] >>> 2) & 0x3f;
    const offset = (extReg << 8) | (regNum << 2);
    ret.targetTraditional = `${bus.toString(16).toUpperCase().padStart(2, "0")}:${dev.toString(16).toUpperCase().padStart(2, "0")}.${fun.toString(16).toUpperCase()}`;
    ret.targetAri = `Bus ${bus.toString(16).toUpperCase().padStart(2, "0")}, ARI Function 0x${ariFunc.toString(16).toUpperCase().padStart(2, "0")} (${ariFunc})`;
    ret.configOffset = `0x${offset.toString(16).toUpperCase().padStart(3, "0")}`;
    const verb = /Rd/i.test(typeInfo.name) ? "讀取" : "寫入";
    ret.summary =
      `${typeInfo.name}：Requester ${ret.requesterTraditional} 對 Target ${ret.targetTraditional} 的 PCI Configuration Space ${ret.configOffset} 做${verb}，` +
      `Length=${ret.lengthDw} DW (${ret.lengthBytes} Bytes)。若當時 ARI Forwarding 已啟用，Target 也可解讀為 ${ret.targetAri}。`;
    if (offset === 0 && /^CfgRd/i.test(typeInfo.name)) {
      ret.summary += " Offset 0x000 通常是在讀取 Vendor ID / Device ID，常見於裝置存在性或 PCI 列舉 probe。";
    }
  } else if (type === 0x00) {
    let address = 0n;
    if (fmt === 0 || fmt === 2) address = BigInt(dw[2] & 0xfffffffc);
    else if (fmt === 1 || fmt === 3) address = (BigInt(dw[2]) << 32n) | BigInt(dw[3] & 0xfffffffc);
    ret.address = `0x${address.toString(16).toUpperCase().padStart(16, "0")}`;
    const verb = /Rd/i.test(typeInfo.name) ? "Memory Read" : "Memory Write";
    ret.summary = `${verb}: Requester ${ret.requesterTraditional}, Address=${ret.address}, Length=${ret.lengthDw} DW (${ret.lengthBytes} Bytes).`;
  } else if (type === 0x02) {
    const address = dw[2] & 0xfffffffc;
    ret.address = `0x${address.toString(16).toUpperCase().padStart(8, "0")}`;
    ret.summary = `${typeInfo.name}: Requester ${ret.requesterTraditional}, I/O Address=${ret.address}, Length=${ret.lengthDw} DW.`;
  } else if (type === 0x0a || type === 0x0b) {
    const completer = (dw[1] >>> 16) & 0xffff;
    const cplStatus = (dw[1] >>> 13) & 0x7;
    const byteCount = dw[1] & 0xfff;
    const reqRid = (dw[2] >>> 16) & 0xffff;
    const cplTag = (dw[2] >>> 8) & 0xff;
    const lowerAddress = dw[2] & 0x7f;
    const statusText =
      cplStatus === 0 ? "SC (Successful Completion)"
        : cplStatus === 1 ? "UR (Unsupported Request)"
          : cplStatus === 2 ? "CRS (Configuration Request Retry Status)"
            : cplStatus === 4 ? "CA (Completer Abort)"
              : `Reserved/Unknown (${cplStatus})`;
    ret.requesterTraditional = formatRidTraditional(reqRid);
    ret.requesterAri = formatRidAri(reqRid);
    ret.summary =
      `${typeInfo.name}: Completer ${formatRidTraditional(completer)} -> Requester ${ret.requesterTraditional}, ` +
      `Completion Status=${statusText}, ByteCount=${byteCount}, LowerAddress=0x${cplTag.toString(16)}/${lowerAddress.toString(16).toUpperCase().padStart(2, "0")}.`;
  } else if (typeInfo.name === "Message") {
    ret.summary = `PCIe Message TLP: Fmt=${fmt}, Type=0x${type.toString(16).toUpperCase()}, Length=${ret.lengthDw} DW.`;
  } else {
    ret.summary = `Unsupported/unknown TLP: Fmt=${fmt}, Type=0x${type.toString(16).toUpperCase()}, DW0=0x${dw[0].toString(16).toUpperCase()}.`;
  }

  return ret;
}
