/** Neon + Worker API mode (preferred; leaves Supabase). */
export function hasApiConfig(): boolean {
  return Boolean(import.meta.env.VITE_API_URL);
}

/** Legacy Supabase direct-from-browser mode. */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}

/** Any remote cloud backend (API preferred over Supabase). */
export function hasCloudConfig(): boolean {
  return hasApiConfig() || hasSupabaseConfig();
}

export function usernameFromEmail(email: string, taken: Set<string>): string {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 24) || "user";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}${n}`;
    n += 1;
  }
  return candidate;
}

export const DEFAULT_PASSWORD = "123456";

export function randomPassword(): string {
  return DEFAULT_PASSWORD;
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`;
          return cell;
        })
        .join(","),
    )
    .join("\n");
}
