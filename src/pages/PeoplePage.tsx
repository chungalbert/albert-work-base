import { FormEvent, useMemo, useState } from "react";
import { api } from "../lib/api";
import { downloadText, toCsv } from "../lib/util";
import type { CredentialRow, Role } from "../lib/types";
import { useStore } from "../context/StoreContext";

interface Row {
  display_name: string;
  unit: string;
  email: string;
}

const emptyRow = (): Row => ({ display_name: "", unit: "", email: "" });

export function PeoplePage() {
  const { project, profiles, members, role, reload } = useStore();
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [paste, setPaste] = useState("");
  const [creds, setCreds] = useState<CredentialRow[]>([]);
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickId, setPickId] = useState("");
  const [pickRole, setPickRole] = useState<Role>("member");

  const people = useMemo(() => {
    return members.map((m) => ({
      ...m,
      profile: profiles.find((p) => p.id === m.user_id),
    }));
  }, [members, profiles]);

  const canManage = role === "leader";
  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = profiles.filter((p) => !memberIds.has(p.id));

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
      })),
    );
  };

  const createAccounts = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = rows.filter((r) => r.display_name && r.email);
      if (payload.length === 0) throw new Error("請至少填一列姓名與 EMAIL");
      const next = await api.createAccounts(payload);
      setCreds(next);
      setRows([emptyRow(), emptyRow(), emptyRow()]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "開通失敗");
    } finally {
      setBusy(false);
    }
  };

  const addToProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || !pickId) return;
    setAddError("");
    try {
      await api.addProjectMember(project.id, pickId, pickRole);
      setPickId("");
      setPickRole("member");
      await reload();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "加入失敗");
    }
  };

  const download = () => {
    const csv = toCsv([
      ["姓名", "帳號", "EMAIL", "密碼"],
      ...creds.map((c) => [c.display_name, c.username, c.email, c.password]),
    ]);
    downloadText("default-accounts.csv", csv, "text/csv;charset=utf-8");
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>人員</h1>
          <p>開通帳密與加入專案是分開的。先開通帳號，再由專案領導用下拉選單把人加進目前專案。</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{project?.name ?? "尚未選擇專案"} 成員</h2>
        <div className="table-wrap">
          <table className="table">
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
              {people.length === 0 && (
                <tr>
                  <td colSpan={5} className="hint">這個專案還沒有成員。</td>
                </tr>
              )}
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

        {canManage && project && (
          <form className="add-member-row" onSubmit={addToProject}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="pick-user">加入現有人員</label>
              <select
                id="pick-user"
                value={pickId}
                onChange={(e) => setPickId(e.target.value)}
                required
              >
                <option value="">{candidates.length === 0 ? "沒有可加入的人員，請先下方開通帳號" : "選擇人員"}</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}（{p.username}）
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="pick-role">專案角色</label>
              <select id="pick-role" value={pickRole} onChange={(e) => setPickRole(e.target.value as Role)}>
                <option value="member">專案成員</option>
                <option value="leader">專案領導</option>
              </select>
            </div>
            <button className="btn btn-gold" type="submit" disabled={!pickId}>
              加入「{project.name}」
            </button>
            {addError && <p className="error" style={{ margin: 0 }}>{addError}</p>}
          </form>
        )}
      </div>

      {canManage && (
        <form className="panel" onSubmit={createAccounts}>
          <h2 style={{ marginTop: 0 }}>開通帳號（獨立，不加入專案）</h2>
          <p className="hint">只產生登入帳密。要進專案，請用上面的下拉選單選人。</p>
          <div className="field">
            <label htmlFor="paste">貼上 CSV / TSV（姓名, 單位, EMAIL）</label>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setRows([...rows, emptyRow()])}>加一列</button>
            <button className="btn btn-gold" type="submit" disabled={busy}>
              {busy ? "開通中…" : "產生帳密"}
            </button>
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
          <p className="hint">只顯示這一次，請立刻下載。這些人還沒進任何專案，請再到上面用下拉選單加入。</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>帳號</th>
                  <th>EMAIL</th>
                  <th>密碼</th>
                </tr>
              </thead>
              <tbody>
                {creds.map((c) => (
                  <tr key={c.username + c.email}>
                    <td>{c.display_name}</td>
                    <td>{c.username}</td>
                    <td>{c.email}</td>
                    <td>{c.password}</td>
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
