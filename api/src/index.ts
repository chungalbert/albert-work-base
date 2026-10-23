import { hashPassword, randomToken, sha256Hex, verifyPassword } from "./crypto";
import { getSql, type Sql } from "./db";

export interface Env {
  DATABASE_URL?: string;
  AUTH_SECRET?: string;
  CRON_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  CORS_ORIGIN?: string;
}

type Profile = {
  id: string;
  username: string;
  display_name: string;
  unit: string;
  email: string;
  is_admin: boolean;
};

const DEFAULT_PASSWORD = "abcd1234";
const SESSION_DAYS = 30;

function corsHeaders(env: Env, req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = (env.CORS_ORIGIN ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allow =
    allowed.includes("*") || allowed.includes(origin) ? origin || allowed[0] || "*" : allowed[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(env: Env, req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env, req) },
  });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function requireUser(sql: Sql, req: Request): Promise<Profile> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "未登入");
  const tokenHash = await sha256Hex(token);
  const rows = await sql`
    select p.id, p.username, p.display_name, p.unit, p.email, p.is_admin
    from sessions s
    join profiles p on p.id = s.user_id
    where s.token_hash = ${tokenHash} and s.expires_at > now()
    limit 1
  `;
  if (!rows[0]) throw new HttpError(401, "未登入");
  return rows[0] as Profile;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function createSession(sql: Sql, userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash}, ${expires})
  `;
  return token;
}

async function isProjectLeader(sql: Sql, me: Profile, projectId: string): Promise<boolean> {
  if (me.is_admin) return true;
  const rows = await sql`
    select 1 from project_members
    where project_id = ${projectId} and user_id = ${me.id} and role = 'leader'
    limit 1
  `;
  return rows.length > 0;
}

async function isProjectMember(sql: Sql, me: Profile, projectId: string): Promise<boolean> {
  if (me.is_admin) return true;
  const rows = await sql`
    select 1 from project_members
    where project_id = ${projectId} and user_id = ${me.id}
    limit 1
  `;
  return rows.length > 0;
}

async function canManageAccounts(sql: Sql, me: Profile): Promise<boolean> {
  if (me.is_admin) return true;
  const rows = await sql`
    select 1 from project_members where user_id = ${me.id} and role = 'leader' limit 1
  `;
  return rows.length > 0;
}

function mapNote(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    color: (row.color as string) || "blue",
    pinned: Boolean(row.pinned),
    url: (row.url as string | null)?.trim() || undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapOtp(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    label: String(row.label ?? ""),
    issuer: String(row.issuer ?? ""),
    account: String(row.account ?? ""),
    secret: String(row.secret ?? ""),
    qr_text: (row.qr_text as string | null)?.trim() || undefined,
    thumb: (row.thumb as string | null)?.trim() || undefined,
    access_password: (row.access_password as string | null)?.trim() || undefined,
    owner_id: row.created_by ? String(row.created_by) : undefined,
    created_at: Number(row.created_at) || Math.floor(Date.now() / 1000),
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders(env, req) });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    try {
      if (path === "/health") {
        return json(env, req, {
          ok: true,
          database: Boolean(env.DATABASE_URL),
          auth: Boolean(env.AUTH_SECRET),
        });
      }

      if (!env.DATABASE_URL) {
        return json(
          env,
          req,
          { error: "API not configured: set DATABASE_URL (Neon) via wrangler secret" },
          503,
        );
      }
      const sql = getSql(env.DATABASE_URL);

      // --- Auth ---
      if (path === "/auth/sign-in" && req.method === "POST") {
        const body = await readJson(req);
        const identifier = String(body.identifier ?? "").trim();
        const password = String(body.password ?? "");
        if (!identifier || !password) throw new HttpError(400, "帳號或密碼不正確。");
        const users = await sql`
          select u.id, u.password_hash, p.id as profile_id, p.username, p.display_name, p.unit, p.email, p.is_admin
          from users u
          join profiles p on p.id = u.id
          where lower(u.email) = lower(${identifier})
             or lower(u.username) = lower(${identifier})
             or lower(p.display_name) = lower(${identifier})
          limit 1
        `;
        const user = users[0] as
          | (Profile & { password_hash: string; profile_id: string })
          | undefined;
        if (!user || !(await verifyPassword(password, user.password_hash))) {
          throw new HttpError(401, "帳號或密碼不正確。");
        }
        const token = await createSession(sql, user.id);
        const profile: Profile = {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          unit: user.unit,
          email: user.email,
          is_admin: user.is_admin,
        };
        return json(env, req, { token, profile });
      }

      if (path === "/auth/sign-out" && req.method === "POST") {
        const header = req.headers.get("Authorization") ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        if (token) {
          const tokenHash = await sha256Hex(token);
          await sql`delete from sessions where token_hash = ${tokenHash}`;
        }
        return json(env, req, { ok: true });
      }

      if (path === "/auth/me" && req.method === "GET") {
        const me = await requireUser(sql, req);
        return json(env, req, me);
      }

      if (path === "/auth/bootstrap-admin" && req.method === "POST") {
        throw new HttpError(
          403,
          "Public Create admin is disabled. Ask an Admin to Add Member in Personnel.",
        );
      }

      if (path === "/auth/change-password" && req.method === "POST") {
        const me = await requireUser(sql, req);
        const body = await readJson(req);
        const current = String(body.current ?? "");
        const next = String(body.next ?? "").trim();
        if (next.length < 6) throw new HttpError(400, "新密碼至少 6 碼");
        const rows = await sql`select password_hash from users where id = ${me.id}`;
        const hash = String((rows[0] as { password_hash: string } | undefined)?.password_hash ?? "");
        if (!(await verifyPassword(current, hash))) throw new HttpError(400, "目前密碼不正確");
        const password_hash = await hashPassword(next);
        await sql`update users set password_hash = ${password_hash} where id = ${me.id}`;
        return json(env, req, { ok: true });
      }

      // --- Profiles / projects ---
      if (path === "/api/profiles" && req.method === "GET") {
        await requireUser(sql, req);
        const rows = await sql`select * from profiles order by display_name`;
        return json(env, req, rows);
      }

      if (path === "/api/projects" && req.method === "GET") {
        const me = await requireUser(sql, req);
        const rows = me.is_admin
          ? await sql`select * from projects order by created_at`
          : await sql`
              select p.* from projects p
              join project_members m on m.project_id = p.id
              where m.user_id = ${me.id}
              order by p.created_at
            `;
        return json(env, req, rows);
      }

      if (path === "/api/projects" && req.method === "POST") {
        const me = await requireUser(sql, req);
        const body = await readJson(req);
        const name = String(body.name ?? "").trim();
        const description = String(body.description ?? "");
        if (!name) throw new HttpError(400, "專案名稱不能空白");
        const rows = await sql`
          insert into projects (name, description, created_by)
          values (${name}, ${description}, ${me.id})
          returning *
        `;
        return json(env, req, rows[0]);
      }

      if (path === "/api/projects/leader-ids" && req.method === "GET") {
        const me = await requireUser(sql, req);
        if (me.is_admin) {
          const rows = await sql`select id from projects`;
          return json(
            env,
            req,
            rows.map((r) => (r as { id: string }).id),
          );
        }
        const rows = await sql`
          select project_id from project_members
          where user_id = ${me.id} and role = 'leader'
        `;
        return json(
          env,
          req,
          rows.map((r) => (r as { project_id: string }).project_id),
        );
      }

      {
        const m = path.match(/^\/api\/projects\/([^/]+)$/);
        if (m && req.method === "DELETE") {
          const me = await requireUser(sql, req);
          const projectId = m[1];
          if (!(await isProjectLeader(sql, me, projectId))) throw new HttpError(403, "沒有權限");
          await sql`delete from projects where id = ${projectId}`;
          return json(env, req, { ok: true });
        }
      }

      {
        const m = path.match(/^\/api\/projects\/([^/]+)\/members$/);
        if (m && req.method === "GET") {
          const me = await requireUser(sql, req);
          const projectId = m[1];
          if (!(await isProjectMember(sql, me, projectId))) throw new HttpError(403, "沒有權限");
          const rows = await sql`select * from project_members where project_id = ${projectId}`;
          return json(env, req, rows);
        }
        if (m && req.method === "POST") {
          const me = await requireUser(sql, req);
          const projectId = m[1];
          if (!(await isProjectLeader(sql, me, projectId))) throw new HttpError(403, "沒有權限");
          const body = await readJson(req);
          const userId = String(body.user_id ?? "");
          const role = String(body.role ?? "member");
          if (role !== "leader" && role !== "member") throw new HttpError(400, "角色無效");
          const rows = await sql`
            insert into project_members (project_id, user_id, role)
            values (${projectId}, ${userId}, ${role})
            on conflict (project_id, user_id) do update set role = excluded.role
            returning *
          `;
          return json(env, req, rows[0]);
        }
      }

      {
        const m = path.match(/^\/api\/projects\/([^/]+)\/members\/([^/]+)$/);
        if (m && req.method === "DELETE") {
          const me = await requireUser(sql, req);
          const projectId = m[1];
          const userId = m[2];
          if (!(await isProjectLeader(sql, me, projectId))) throw new HttpError(403, "沒有權限");
          await sql`delete from project_members where project_id = ${projectId} and user_id = ${userId}`;
          return json(env, req, { ok: true });
        }
      }

      {
        const m = path.match(/^\/api\/projects\/([^/]+)\/my-role$/);
        if (m && req.method === "GET") {
          const me = await requireUser(sql, req);
          const projectId = m[1];
          if (me.is_admin) return json(env, req, { role: "leader" });
          const rows = await sql`
            select role from project_members where project_id = ${projectId} and user_id = ${me.id}
          `;
          return json(env, req, { role: (rows[0] as { role: string } | undefined)?.role ?? null });
        }
      }

      if (path === "/api/project-members" && req.method === "GET") {
        await requireUser(sql, req);
        const rows = await sql`select * from project_members`;
        return json(env, req, rows);
      }

      // --- Tasks ---
      {
        const m = path.match(/^\/api\/projects\/([^/]+)\/tasks$/);
        if (m && req.method === "GET") {
          const me = await requireUser(sql, req);
          const projectId = m[1];
          if (!(await isProjectMember(sql, me, projectId))) throw new HttpError(403, "沒有權限");
          const rows = await sql`
            select * from tasks where project_id = ${projectId} order by due_date
          `;
          return json(env, req, rows);
        }
      }

      if (path === "/api/tasks" && req.method === "GET") {
        const me = await requireUser(sql, req);
        const rows = me.is_admin
          ? await sql`select * from tasks`
          : await sql`
              select t.* from tasks t
              join project_members m on m.project_id = t.project_id
              where m.user_id = ${me.id}
            `;
        return json(env, req, rows);
      }

      if (path === "/api/tasks" && req.method === "POST") {
        const me = await requireUser(sql, req);
        const body = await readJson(req);
        const projectId = String(body.project_id ?? "");
        if (!(await isProjectLeader(sql, me, projectId))) throw new HttpError(403, "沒有權限");
        const rows = await sql`
          insert into tasks (
            project_id, title, assignee_id, start_date, due_date, status, note,
            analyzed, analyzed_by, analyzed_at, analyzed_notes
          ) values (
            ${projectId},
            ${String(body.title ?? "")},
            ${body.assignee_id ?? null},
            ${String(body.start_date ?? "")},
            ${String(body.due_date ?? "")},
            ${String(body.status ?? "opening")},
            ${String(body.note ?? "")},
            ${String(body.analyzed ?? "")},
            ${body.analyzed_by ?? null},
            ${body.analyzed_at ?? null},
            ${JSON.stringify(body.analyzed_notes ?? [])}::jsonb
          )
          returning *
        `;
        return json(env, req, rows[0]);
      }

      {
        const m = path.match(/^\/api\/tasks\/([^/]+)$/);
        if (m && req.method === "PATCH") {
          const me = await requireUser(sql, req);
          const id = m[1];
          const existing = await sql`select * from tasks where id = ${id}`;
          const task = existing[0] as { project_id: string; assignee_id: string | null } | undefined;
          if (!task) throw new HttpError(404, "找不到任務");
          const leader = await isProjectLeader(sql, me, task.project_id);
          if (!leader && task.assignee_id !== me.id) throw new HttpError(403, "沒有權限");
          const body = await readJson(req);
          const rows = await sql`
            update tasks set
              title = coalesce(${body.title as string | null}, title),
              assignee_id = coalesce(${body.assignee_id as string | null}, assignee_id),
              start_date = coalesce(${body.start_date as string | null}, start_date),
              due_date = coalesce(${body.due_date as string | null}, due_date),
              status = coalesce(${body.status as string | null}, status),
              note = coalesce(${body.note as string | null}, note),
              analyzed = coalesce(${body.analyzed as string | null}, analyzed),
              analyzed_by = coalesce(${body.analyzed_by as string | null}, analyzed_by),
              analyzed_at = coalesce(${body.analyzed_at as string | null}, analyzed_at),
              analyzed_notes = coalesce(${body.analyzed_notes != null ? JSON.stringify(body.analyzed_notes) : null}::jsonb, analyzed_notes)
            where id = ${id}
            returning *
          `;
          return json(env, req, rows[0]);
        }
        if (m && req.method === "DELETE") {
          const me = await requireUser(sql, req);
          const id = m[1];
          const existing = await sql`select project_id from tasks where id = ${id}`;
          const task = existing[0] as { project_id: string } | undefined;
          if (!task) throw new HttpError(404, "找不到任務");
          if (!(await isProjectLeader(sql, me, task.project_id))) throw new HttpError(403, "沒有權限");
          await sql`delete from tasks where id = ${id}`;
          return json(env, req, { ok: true });
        }
      }

      // --- Notes ---
      if (path === "/api/notes" && req.method === "GET") {
        await requireUser(sql, req);
        const rows = await sql`select * from shared_notes order by updated_at desc`;
        return json(
          env,
          req,
          rows.map((r) => mapNote(r as Record<string, unknown>)),
        );
      }

      if (path === "/api/notes" && req.method === "POST") {
        const me = await requireUser(sql, req);
        const body = await readJson(req);
        const rows = await sql`
          insert into shared_notes (title, body, color, url, pinned, created_by)
          values (
            ${String(body.title ?? "").trim()},
            ${String(body.body ?? "").trim()},
            ${String(body.color ?? "blue")},
            ${body.url ? String(body.url).trim() : null},
            false,
            ${me.id}
          )
          returning *
        `;
        return json(env, req, mapNote(rows[0] as Record<string, unknown>));
      }

      if (path === "/api/notes/upsert" && req.method === "POST") {
        await requireUser(sql, req);
        const body = await readJson(req);
        await sql`
          insert into shared_notes (id, title, body, color, pinned, url, created_at, updated_at)
          values (
            ${String(body.id)},
            ${String(body.title ?? "")},
            ${String(body.body ?? "")},
            ${String(body.color ?? "blue")},
            ${Boolean(body.pinned)},
            ${body.url ? String(body.url).trim() : null},
            ${String(body.created_at ?? new Date().toISOString())},
            ${String(body.updated_at ?? new Date().toISOString())}
          )
          on conflict (id) do update set
            title = excluded.title,
            body = excluded.body,
            color = excluded.color,
            pinned = excluded.pinned,
            url = excluded.url,
            updated_at = excluded.updated_at
        `;
        return json(env, req, { ok: true });
      }

      {
        const m = path.match(/^\/api\/notes\/([^/]+)$/);
        if (m && req.method === "PATCH") {
          await requireUser(sql, req);
          const id = m[1];
          const body = await readJson(req);
          const rows = await sql`
            update shared_notes set
              title = coalesce(${body.title != null ? String(body.title).trim() : null}, title),
              body = coalesce(${body.body != null ? String(body.body).trim() : null}, body),
              color = coalesce(${body.color != null ? String(body.color) : null}, color),
              url = coalesce(${body.url != null ? String(body.url).trim() || null : null}, url),
              pinned = coalesce(${body.pinned as boolean | null}, pinned),
              updated_at = now()
            where id = ${id}
            returning *
          `;
          if (!rows[0]) throw new HttpError(404, "找不到筆記");
          return json(env, req, mapNote(rows[0] as Record<string, unknown>));
        }
        if (m && req.method === "DELETE") {
          await requireUser(sql, req);
          await sql`delete from shared_notes where id = ${m[1]}`;
          return json(env, req, { ok: true });
        }
      }

      // --- OTP ---
      if (path === "/api/otp" && req.method === "GET") {
        await requireUser(sql, req);
        const rows = await sql`select * from otp_vault_entries order by created_at desc`;
        return json(
          env,
          req,
          rows.map((r) => mapOtp(r as Record<string, unknown>)),
        );
      }

      if (path === "/api/otp" && req.method === "POST") {
        const me = await requireUser(sql, req);
        const body = await readJson(req);
        const issuer = String(body.issuer ?? "").trim();
        const account = String(body.account ?? "").trim();
        const label =
          String(body.label ?? "").trim() ||
          (issuer && account ? `${issuer} · ${account}` : issuer || account || "OTP entry");
        const id = `otp_${crypto.randomUUID()}`;
        const created_at = Math.floor(Date.now() / 1000);
        const secret = String(body.secret ?? "")
          .replace(/\s+/g, "")
          .toUpperCase();
        const rows = await sql`
          insert into otp_vault_entries (
            id, label, issuer, account, secret, qr_text, thumb, access_password, created_by, created_at
          ) values (
            ${id}, ${label}, ${issuer}, ${account}, ${secret},
            ${body.qr_text ? String(body.qr_text).trim() : null},
            ${body.thumb ? String(body.thumb).trim() : null},
            ${body.access_password ? String(body.access_password).trim() : null},
            ${me.id}, ${created_at}
          )
          returning *
        `;
        return json(env, req, mapOtp(rows[0] as Record<string, unknown>));
      }

      if (path === "/api/otp/upsert" && req.method === "POST") {
        const me = await requireUser(sql, req);
        const body = await readJson(req);
        const owner = String(body.owner_id ?? "");
        const ownerLooksLikeUuid = /^[0-9a-f-]{36}$/i.test(owner);
        const secret = String(body.secret ?? "")
          .replace(/\s+/g, "")
          .toUpperCase();
        await sql`
          insert into otp_vault_entries (
            id, label, issuer, account, secret, qr_text, thumb, access_password, created_by, created_at
          ) values (
            ${String(body.id)},
            ${String(body.label ?? "")},
            ${String(body.issuer ?? "")},
            ${String(body.account ?? "")},
            ${secret},
            ${body.qr_text ? String(body.qr_text).trim() : null},
            ${body.thumb ? String(body.thumb).trim() : null},
            ${body.access_password ? String(body.access_password).trim() : null},
            ${ownerLooksLikeUuid ? owner : me.id},
            ${Number(body.created_at) || Math.floor(Date.now() / 1000)}
          )
          on conflict (id) do update set
            label = excluded.label,
            issuer = excluded.issuer,
            account = excluded.account,
            secret = excluded.secret,
            qr_text = excluded.qr_text,
            thumb = excluded.thumb,
            access_password = excluded.access_password
        `;
        return json(env, req, { ok: true });
      }

      {
        const m = path.match(/^\/api\/otp\/(.+)$/);
        if (m && req.method === "DELETE") {
          await requireUser(sql, req);
          await sql`delete from otp_vault_entries where id = ${decodeURIComponent(m[1])}`;
          return json(env, req, { ok: true });
        }
      }

      // --- Admin (invite / reset / delete) ---
      if (path === "/api/admin/invite" && req.method === "POST") {
        const me = await requireUser(sql, req);
        const body = await readJson(req);
        const rows = (body.rows ?? []) as Array<{
          display_name: string;
          unit?: string;
          email: string;
          role?: "leader" | "member";
          project_id?: string;
        }>;
        const existing = await sql`select username, email from profiles`;
        const taken = new Set(
          (existing as Array<{ username: string }>).map((p) => p.username.toLowerCase()),
        );
        const credentials: Array<{ username: string; email: string; password: string }> = [];
        for (const row of rows) {
          const email = String(row.email ?? "").trim().toLowerCase();
          const display_name = String(row.display_name ?? "").trim() || email.split("@")[0];
          if (!email) continue;
          const found = await sql`select id from profiles where lower(email) = ${email} limit 1`;
          let userId = (found[0] as { id: string } | undefined)?.id;
          let password = DEFAULT_PASSWORD;
          if (!userId) {
            if (!me.is_admin) throw new HttpError(403, "只有 Admin 可以新增 Member");
            let base =
              email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24) || "user";
            let username = base;
            let n = 2;
            while (taken.has(username)) {
              username = `${base}${n}`;
              n += 1;
            }
            taken.add(username);
            userId = crypto.randomUUID();
            const password_hash = await hashPassword(password);
            await sql`insert into users (id, email, username, password_hash) values (${userId}, ${email}, ${username}, ${password_hash})`;
            await sql`
              insert into profiles (id, username, display_name, email, is_admin, unit)
              values (${userId}, ${username}, ${display_name}, ${email}, false, ${String(row.unit ?? "")})
            `;
            credentials.push({ username, email, password });
          }
          if (row.project_id) {
            if (!(await canManageAccounts(sql, me)) && !(await isProjectLeader(sql, me, row.project_id))) {
              throw new HttpError(403, "只有專案領導或管理員可以加人");
            }
            const role = row.role === "leader" ? "leader" : "member";
            await sql`
              insert into project_members (project_id, user_id, role)
              values (${row.project_id}, ${userId}, ${role})
              on conflict (project_id, user_id) do update set role = excluded.role
            `;
          } else if (!me.is_admin) {
            throw new HttpError(403, "只有 Admin 可以新增 Member");
          }
        }
        return json(env, req, { credentials });
      }

      if (path === "/api/admin/reset-password" && req.method === "POST") {
        const me = await requireUser(sql, req);
        if (!(await canManageAccounts(sql, me))) throw new HttpError(403, "只有專案領導或管理員可以重設密碼");
        const body = await readJson(req);
        const userId = String(body.user_id ?? "");
        const password_hash = await hashPassword(DEFAULT_PASSWORD);
        await sql`update users set password_hash = ${password_hash} where id = ${userId}`;
        await sql`delete from sessions where user_id = ${userId}`;
        return json(env, req, { ok: true, password: DEFAULT_PASSWORD });
      }

      if (path === "/api/admin/delete-person" && req.method === "POST") {
        const me = await requireUser(sql, req);
        if (!me.is_admin) throw new HttpError(403, "只有管理員可以刪除人員");
        const body = await readJson(req);
        const userId = String(body.user_id ?? "");
        if (userId === me.id) throw new HttpError(400, "不能刪除自己");
        await sql`delete from project_members where user_id = ${userId}`;
        await sql`update tasks set assignee_id = null where assignee_id = ${userId}`;
        await sql`update projects set created_by = ${me.id} where created_by = ${userId}`;
        await sql`delete from profiles where id = ${userId}`;
        await sql`delete from users where id = ${userId}`;
        return json(env, req, { ok: true });
      }

      // Reminders cron (port of send-reminders)
      if (path === "/api/cron/reminders" && req.method === "POST") {
        const secret = env.CRON_SECRET ?? "";
        const header = req.headers.get("Authorization") ?? "";
        if (!secret || header !== `Bearer ${secret}`) throw new HttpError(401, "unauthorized");
        return json(env, req, {
          ok: true,
          note: "Reminder email loop stub — wire RESEND_* when ready; queries tasks/profiles like former edge function.",
        });
      }

      return json(env, req, { error: "not found" }, 404);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(env, req, { error: err.message }, err.status);
      }
      const message = err instanceof Error ? err.message : String(err);
      return json(env, req, { error: message }, 500);
    }
  },
};
