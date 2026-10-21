import { createClient as createNeonClient, defaultDeriveNeonUrls, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasNeonConfig, hasSupabaseCredentials } from "./util";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (hasNeonConfig()) {
    if (!client) {
      const urls = defaultDeriveNeonUrls(import.meta.env.VITE_NEON_URL!);
      client = createNeonClient({
        auth: {
          url: urls.auth,
          adapter: SupabaseAuthAdapter(),
          // Username login calls lookup_login_email before a session exists.
          // Anonymous JWT is not a user; a real session still wins in getJWTToken.
          allowAnonymous: true,
        },
        dataApi: { url: urls.dataApi },
      }) as unknown as SupabaseClient;
    }
    return client;
  }
  if (!hasSupabaseCredentials()) return null;
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
