# Albert的工作基地

人員任務安排、可拖曳甘特圖、一鍵週報。畫面部署在 GitHub Pages；共用資料與寄信走 Supabase / Resend。

## 本機試用（不必先接雲端）

```bash
npm install
npm run dev
```

帳號 `admin`，密碼用你原本那組。資料存在瀏覽器。

## 接上雲端（多人 + EMAIL）

1. 建立 [Supabase](https://supabase.com) 專案，在 SQL Editor 執行 `supabase/migrations/20260910_init.sql`。
2. 部署 Functions：`invite-members`、`send-reminders`。在 Function secrets 設定 `SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`，寄信再加 `RESEND_API_KEY`、`RESEND_FROM`。
3. GitHub Secrets：
   - `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（給 Pages 建置）
   - `SUPABASE_URL`、`CRON_SECRET`（給每日提醒 workflow）
4. 網站登入頁用「建立管理員」註冊第一個帳號（第一人自動成為 admin）。
5. Resend 未驗證網域時只能寄到你自己的信箱；要寄給成員需驗證網域。沒有金鑰時，提醒仍會顯示在網站上方。

每日 08:00（台北）由 `.github/workflows/reminders.yml` 呼叫 `send-reminders`。
