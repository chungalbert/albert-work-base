import { neonApi } from "./neonApi";
import { hasApiConfig } from "./util";

type CloudBackend = typeof neonApi;

/**
 * Cloud data/auth facade.
 * - `VITE_API_URL` set → Neon Worker client only (supabaseApi never called)
 * - else legacy Supabase via dynamic import (kept for rollback until cutover)
 */
function legacyBackend(): CloudBackend {
  const cache: { api?: CloudBackend } = {};
  return new Proxy({} as CloudBackend, {
    get(_target, prop: string | symbol) {
      return async (...args: unknown[]) => {
        if (!cache.api) {
          const mod = await import("./supabaseApi");
          cache.api = mod.supabaseApi;
        }
        const fn = cache.api[prop as keyof CloudBackend] as (...a: unknown[]) => unknown;
        return fn(...args);
      };
    },
  });
}

export const cloudApi: CloudBackend = hasApiConfig() ? neonApi : legacyBackend();
