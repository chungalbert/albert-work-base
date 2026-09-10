import { FormEvent, useMemo, useState } from "react";
import { api } from "../lib/api";
import { downloadText, toCsv } from "../lib/util";
import type { CredentialRow, InviteInput, Role } from "../lib/types";
import { useStore } from "../context/StoreContext";

interface Row {
  display_name: string;
  unit: string;
  email: string;
  role: Role;
}

const emptyRow = (): Row => ({ display_name: "", unit: "", email: "", role: "member" });

export function PeoplePage() {
  const { project, projects, profiles, members, role, reload } = useStore();
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [paste, setPaste] = useState("");
  const [creds, setCreds] = useState<CredentialRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    return members.map((m) => ({
      ...m,
      profile: profiles.find((p) => p.id === m.user_id),
    }));
  }, [members, profiles]);

  const canInvite = role === "leader";

  const applyPaste = () => {
    const parsed = paste
      .split(/\n+/)
      .map((line) => line.split(/[\t,]/).map((c) => c.trim()))
      .filter((cols) => cols[0]);
    if (parsed.length === 0) return;
    setRows(
      parsed.map((cols) => ({
        display_name: cols[0] ?? "",
        unit: cols[1] ?? "",
        email: cols[2] ?? "",
        role: cols[3]?.includes("領") ? "leader" : "member",
      })),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;
    setError("");
    setBusy(true);
    try {
      const payload: InviteInput[] = rows
        .filter((r) => r.display_name && r.email)
        .map((r) => ({ ...r, project_id: project.id }));
      if (payload.length === 0) throw new Error("請至少填一列姓名與 EMAIL");
      const next = await api.inviteMembers(payload);
      setCreds(next);
      setRows([emptyRow(), emptyRow(), emptyRow()]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const csv = toCsv([
      ["姓名", "帳號", "EMAIL", "密碼", "專案", "角色"],
      ...creds.map((c) => [c.display_name, c.username, c.email, c.password, c.project_name, c.role === "leader" ? "專案領導" : "專案成員"]),
    ]);
    downloadText("default-accounts.csv", csv, "text/csv;charset=utf-8");
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>人員</h1>
          <p>批量新增時會產生 Default 帳號與密碼，只顯示這一次，請立刻下載。</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{project?.name ?? "尚未選擇專案"} 成員</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>單位</th>
                <th>EMAIL</th>
                <th>帳號</th>
                <th>角色</th>
              </tr>
            </thead>
            <tbody>
              {people.map((row) => (
                <tr key={`${row.project_id}-${row.user_id}`}>
                  <td>{row.profile?.display_name}</td>
                  <td>{row.profile?.unit}</td>
                  <td>{row.profile?.email}</td>
                  <td>{row.profile?.username}</td>
                  <td>{row.role === "leader" ? "專案領導" : "專案成員"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canInvite && (
        <form className="panel" onSubmit={submit}>
          <h2 style={{ marginTop: 0 }}>批量新增到「{project?.name}」</h2>
          <p className="hint">可貼上：姓名, 單位, EMAIL, 角色（領導/成員）。角色也可在表格改。</p>
          <div className="field">
            <label htmlFor="paste">貼上 CSV / TSV</label>
            <textarea id="paste" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} />
          </div>
          <button type="button" className="btn" onClick={applyPaste}>帶入表格</button>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>單位</th>
                  <th>EMAIL</th>
                  <th>角色</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        value={row.display_name}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index] = { ...row, display_name: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={row.unit}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index] = { ...row, unit: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={row.email}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index] = { ...row, email: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={row.role}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index] = { ...row, role: e.target.value as Role };
                          setRows(next);
                        }}
                      >
                        <option value="member">專案成員</option>
                        <option value="leader">專案領導</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setRows([...rows, emptyRow()])}>加一列</button>
            <button className="btn btn-gold" type="submit" disabled={busy || !project}>
              {busy ? "新增中…" : "新增並產生帳密"}
            </button>
            {projects.length > 1 && <span className="hint">人員會加入目前上方選取的專案。</span>}
          </div>
          <p className="error">{error}</p>
        </form>
      )}

      {creds.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="page-head">
            <h2 style={{ margin: 0 }}>本次產生的 Default 帳密</h2>
            <button className="btn btn-gold" type="button" onClick={download}>下載 CSV</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>帳號</th>
                  <th>EMAIL</th>
                  <th>密碼</th>
                  <th>角色</th>
                </tr>
              </thead>
              <tbody>
                {creds.map((c) => (
                  <tr key={c.username + c.email}>
                    <td>{c.display_name}</td>
                    <td>{c.username}</td>
                    <td>{c.email}</td>
                    <td>{c.password}</td>
                    <td>{c.role === "leader" ? "專案領導" : "專案成員"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
