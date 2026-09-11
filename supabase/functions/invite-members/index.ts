import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function usernameFromEmail(email: string, taken: Set<string>) {
  const base =
    email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24) ||
    "user";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}${n}`;
    n += 1;
  }
  return candidate;
}

function randomPassword() {
  return "123456";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "未登入" }, 401);
  }

  const { data: me } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();

  const body = await req.json();
  const resetUserId = typeof body.reset_user_id === "string" ? body.reset_user_id : "";
  const deleteUserId = typeof body.delete_user_id === "string" ? body.delete_user_id : "";
  const rows = (body.rows ?? []) as Array<{
    display_name: string;
    unit: string;
    email: string;
    role?: "leader" | "member";
    project_id?: string;
  }>;

  const { data: existingProfiles } = await admin.from("profiles").select("username,email,id");
  const taken = new Set((existingProfiles ?? []).map((p: { username: string }) => p.username.toLowerCase()));
  const credentials = [];

  const { data: leadRows } = await admin
    .from("project_members")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("role", "leader")
    .limit(1);
  const canCreateAccounts = Boolean(me?.is_admin || (leadRows && leadRows.length > 0));

  if (resetUserId) {
    if (!canCreateAccounts) return json({ error: "只有專案領導或管理員可以重設密碼" }, 403);
    const { data: target } = await admin
      .from("profiles")
      .select("id,is_admin")
      .eq("id", resetUserId)
      .maybeSingle();
    if (!target) return json({ error: "找不到這位人員" }, 404);
    if (target.is_admin && !me?.is_admin) return json({ error: "不能重設管理員密碼" }, 403);
    if (!me?.is_admin) {
      const { data: shared } = await admin.from("project_members").select("project_id").eq("user_id", resetUserId);
      const { data: myLead } = await admin
        .from("project_members")
        .select("project_id")
        .eq("user_id", me.id)
        .eq("role", "leader");
      const leadSet = new Set((myLead ?? []).map((r: { project_id: string }) => r.project_id));
      const ok = (shared ?? []).some((r: { project_id: string }) => leadSet.has(r.project_id));
      if (!ok) return json({ error: "只有專案領導或管理員可以重設密碼" }, 403);
    }
    const updated = await admin.auth.admin.updateUserById(resetUserId, { password: "123456" });
    if (updated.error) return json({ error: updated.error.message }, 400);
    return json({ ok: true });
  }

  if (deleteUserId) {
    if (!canCreateAccounts) return json({ error: "只有專案領導或管理員可以刪除人員" }, 403);
    if (deleteUserId === userData.user.id) return json({ error: "不能刪除自己" }, 400);
    const { data: target } = await admin
      .from("profiles")
      .select("id,is_admin")
      .eq("id", deleteUserId)
      .maybeSingle();
    if (!target) return json({ error: "找不到這位人員" }, 404);
    if (target.is_admin) return json({ error: "不能刪除管理員" }, 403);
    await admin.from("project_members").delete().eq("user_id", deleteUserId);
    await admin.from("tasks").update({ assignee_id: null }).eq("assignee_id", deleteUserId);
    await admin.from("projects").update({ created_by: userData.user.id }).eq("created_by", deleteUserId);
    const removed = await admin.from("profiles").delete().eq("id", deleteUserId);
    if (removed.error) return json({ error: removed.error.message }, 400);
    const authRemoved = await admin.auth.admin.deleteUser(deleteUserId);
    if (authRemoved.error) return json({ error: authRemoved.error.message }, 400);
    return json({ ok: true });
  }

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email || !row.display_name?.trim()) continue;

    if (row.project_id) {
      const { data: membership } = await admin
        .from("project_members")
        .select("role")
        .eq("project_id", row.project_id)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (!me?.is_admin && membership?.role !== "leader") {
        return json({ error: "只有專案領導或管理員可以加人" }, 403);
      }
    } else if (!canCreateAccounts) {
      return json({ error: "只有專案領導或管理員可以開通帳號" }, 403);
    }

    const { data: project } = row.project_id
      ? await admin.from("projects").select("name").eq("id", row.project_id).single()
      : { data: null };

    let profile = (existingProfiles ?? []).find(
      (p: { email: string }) => p.email.toLowerCase() === email,
    ) as { id: string; username: string; email: string } | undefined;

    let password = "";
    let username = profile?.username ?? "";

    if (!profile) {
      username = usernameFromEmail(email, taken);
      taken.add(username);
      password = randomPassword();
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          display_name: row.display_name.trim(),
          unit: row.unit?.trim() ?? "",
        },
      });
      if (created.error) return json({ error: created.error.message }, 400);
      await admin
        .from("profiles")
        .update({
          username,
          display_name: row.display_name.trim(),
          unit: row.unit?.trim() ?? "",
          email,
        })
        .eq("id", created.data.user!.id);
      profile = { id: created.data.user!.id, username, email };
    }

    if (row.project_id) {
      await admin.from("project_members").upsert({
        project_id: row.project_id,
        user_id: profile.id,
        role: row.role ?? "member",
      });
    }

    credentials.push({
      display_name: row.display_name.trim(),
      username: profile.username,
      email,
      password: password || "(已有帳號，沿用原密碼)",
      project_name: project?.name ?? "",
      role: row.role,
    });
  }

  return json({ credentials });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
