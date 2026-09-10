import { hasSupabaseConfig } from "../lib/util";

export function SetupBanner() {
  if (hasSupabaseConfig()) return null;
  return (
    <div className="alerts">
      <h2>目前是本機模式</h2>
      <p className="hint">
        資料存在這台瀏覽器。要多人共用與自動寄信，請建立 Supabase 專案，把 SQL（<code>supabase/migrations</code>）貼進 SQL Editor，
        部署 Edge Functions，並在 GitHub Secrets 設定 <code>VITE_SUPABASE_URL</code>、<code>VITE_SUPABASE_ANON_KEY</code>。
        沒有 Resend 金鑰時，Deadline 只會顯示在網站上方。
      </p>
    </div>
  );
}
