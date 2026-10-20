export function toUInt64Safe(value: unknown): bigint | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    const hex = s.match(/^(?:0x)?([0-9a-f]+)h?$/i);
    if (hex && (/^0x/i.test(s) || /h$/i.test(s) || /^[0-9a-f]+$/i.test(s) && /[a-f]/i.test(s))) {
      return BigInt(`0x${hex[1]}`);
    }
    if (/^(?:0x)([0-9a-f]+)$/i.test(s)) {
      return BigInt(s);
    }
    if (/^\d+$/.test(s)) return BigInt(s);
    if (/^[0-9a-f]+$/i.test(s)) return BigInt(`0x${s}`);
    return null;
  } catch {
    return null;
  }
}

export function formatHexValue(value: unknown, digits = 8): string {
  const v = toUInt64Safe(value);
  if (v == null) return "N/A";
  return `0x${v.toString(16).toUpperCase().padStart(digits, "0")}`;
}

export function reverseDwordHexBytes(hex8: string): string {
  if (hex8.length !== 8) return hex8;
  return hex8.slice(6, 8) + hex8.slice(4, 6) + hex8.slice(2, 4) + hex8.slice(0, 2);
}

export function formatRidTraditional(rid: number): string {
  const bus = (rid >> 8) & 0xff;
  const dev = (rid >> 3) & 0x1f;
  const fun = rid & 0x07;
  return `${bus.toString(16).toUpperCase().padStart(2, "0")}:${dev.toString(16).toUpperCase().padStart(2, "0")}.${fun.toString(16).toUpperCase()}`;
}

export function formatRidAri(rid: number): string {
  const bus = (rid >> 8) & 0xff;
  const fun = rid & 0xff;
  return `Bus ${bus.toString(16).toUpperCase().padStart(2, "0")}, ARI Function 0x${fun.toString(16).toUpperCase().padStart(2, "0")} (${fun})`;
}

export function getDataValue(data: Record<string, string>, names: string[], fallback = ""): string {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(data, name) && data[name] != null) {
      return String(data[name]);
    }
  }
  return fallback;
}
