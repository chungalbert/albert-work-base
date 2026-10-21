# Albert的工作基地

人員任務、甘特圖、週報。登入帳號決定能做什麼。

- **管理員 / 專案領導**：建專案、加人、指派任務、改甘特圖、看全員週報
- **專案成員**：看自己的任務、改自己的進度、看專案甘特圖、產出自己的週報

```bash
npm install
npm run dev
```

Cloud: set `VITE_API_URL` to the Cloudflare Worker (Neon). Without cloud env vars, local `awb-store-v1` mode still works. See `docs/neon-cutover.md` and `api/README.md`.

預設管理員帳號 `admin`。新增人員時會產生 Default 帳號密碼，請下載 CSV 交給對方登入。
