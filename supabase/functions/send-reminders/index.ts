import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { skipped: true };
  const from = Deno.env.get("RESEND_FROM") ?? "Albert工作基地 <beth.t@example.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return { ok: res.ok, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const header = req.headers.get("Authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [{ data: tasks }, { data: profiles }, { data: members }, { data: projects }] =
    await Promise.all([
      admin.from("tasks").select("*"),
      admin.from("profiles").select("*"),
      admin.from("project_members").select("*"),
      admin.from("projects").select("*"),
    ]);

  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  const sent: string[] = [];

  for (const task of tasks ?? []) {
    if (task.status === "verify" || task.status === "done" || !task.assignee_id) continue;
    const owner = profileById[task.assignee_id];
    if (!owner?.email) continue;
    let kind = "";
    if (task.due_date < today) kind = "已逾期";
    else if (task.due_date === today) kind = "今日到期";
    else if (task.due_date === tomorrow) kind = "明日到期";
    if (!kind) continue;
    await sendEmail(
      owner.email,
      `【Deadline】${kind}：${task.title}`,
      `<p>${owner.display_name} 你好，</p><p>任務「${task.title}」${kind}（${task.due_date}）。</p><p>請到 Albert 工作基地更新進度。</p>`,
    );
    sent.push(`assignee:${owner.email}:${task.id}`);
  }

  for (const project of projects ?? []) {
    const leaders = (members ?? []).filter(
      (m) => m.project_id === project.id && m.role === "leader",
    );
    const projectTasks = (tasks ?? []).filter((t) => t.project_id === project.id && t.status !== "verify" && t.status !== "done");
    const overdue = projectTasks.filter((t) => t.due_date < today);
    const dueToday = projectTasks.filter((t) => t.due_date === today);
    const week = projectTasks.filter((t) => t.due_date >= today && t.due_date <= weekEnd);
    const html = `
      <h2>${project.name} 每日摘要</h2>
      <p>逾期 ${overdue.length}、今日 ${dueToday.length}、本週 ${week.length}</p>
      <ul>${[...overdue, ...dueToday].map((t) => `<li>${t.title} · ${t.due_date}</li>`).join("")}</ul>
    `;
    for (const leader of leaders) {
      const person = profileById[leader.user_id];
      if (!person?.email) continue;
      await sendEmail(person.email, `【每日提醒】${project.name}`, html);
      sent.push(`leader:${person.email}:${project.id}`);
    }
  }

  return json({
    sent: sent.length,
    emailEnabled: Boolean(Deno.env.get("RESEND_API_KEY")),
    details: sent,
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
