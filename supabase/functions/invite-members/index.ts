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
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
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
