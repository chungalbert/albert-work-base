import { useMemo, useState, type DragEvent } from "react";
import { exportCampaignXlsx } from "../lib/trackerExport";
import { mergeCampaigns, parseTrackerWorkbook } from "../lib/trackerImport";
import { listTrackers, removeTracker, upsertTracker } from "../lib/trackerStore";
import { releaseVsWave } from "../lib/trackerDates";
import { campaignDeadline, emptyRow, emptyWave, AFFECTED_OPTIONS, nextWaveName, pmName, type TrackerCampaign, type TrackerRow, type TrackerWave } from "../lib/trackerTypes";
import { TrackerGantt } from "./TrackerGantt";

type Tab = "table" | "gantt" | "waves";

function dateTone(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function downloadBuffer(name: string, buffer: ArrayBuffer) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, "-");
  a.click();
  URL.revokeObjectURL(url);
}

const WAVES_OPEN_KEY = "awb-tracker-waves-open";

export function TrackerPage() {
  const [campaigns, setCampaigns] = useState<TrackerCampaign[]>(() => listTrackers());
  const [campaignId, setCampaignId] = useState<string | null>(campaigns[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("table");
  const [q, setQ] = useState("");
  const [waveFilter, setWaveFilter] = useState("");
  const [affectedFilter, setAffectedFilter] = useState("");
  const [error, setError] = useState("");
  const [wavesOpen, setWavesOpen] = useState(() => {
    try {
      return localStorage.getItem(WAVES_OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const toggleWaves = () => {
    setWavesOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(WAVES_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const downloadExcel = async (item: TrackerCampaign) => {
    try {
      downloadBuffer(`${item.title}.xlsx`, await exportCampaignXlsx(item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "下載失敗");
    }
  };

  const campaign = campaigns.find((item) => item.id === campaignId) ?? null;
  const visible = useMemo(() => {
    if (!campaign) return [];
    const query = q.trim().toLowerCase();
    return campaign.rows.filter((row) => {
      if (waveFilter && row.wave !== waveFilter) return false;
      if (affectedFilter && row.affected !== affectedFilter) return false;
      if (!query) return true;
      const hay = [row.product, row.code, row.mt, row.platform, row.saOwner, row.dqaOwner, pmName(row), row.biosOwner, row.wave, row.bios].join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [campaign, q, waveFilter, affectedFilter]);

  const save = (next: TrackerCampaign) => {
    setCampaigns(upsertTracker(next));
  };

  const patchRow = (id: string, patch: Partial<TrackerRow>) => {
    if (!campaign) return;
    save({
      ...campaign,
      rows: campaign.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };

  const patchWave = (id: string, patch: Partial<TrackerWave>) => {
    if (!campaign) return;
    save({
      ...campaign,
      waves: campaign.waves.map((wave) => {
        if (wave.id !== id) return wave;
        const next = { ...wave, ...patch };
        return next;
      }),
      rows: patch.name
        ? campaign.rows.map((row) => {
            const wave = campaign.waves.find((item) => item.id === id);
            return wave && row.wave === wave.name ? { ...row, wave: patch.name ?? row.wave } : row;
          })
        : campaign.rows,
    });
  };

  const addWave = (name = "", start = "", end = "") => {
    if (!campaign) return;
    save({ ...campaign, waves: [...campaign.waves, emptyWave(name.trim() || nextWaveName(campaign.waves), start, end)] });
  };

  const importFile = async (file: File, into: TrackerCampaign | null) => {
    setError("");
    try {
      const parsed = parseTrackerWorkbook(await file.arrayBuffer(), file.name);
      if (into) {
        const merged = mergeCampaigns(into, parsed);
        setCampaigns(upsertTracker(merged));
        setCampaignId(merged.id);
        return;
      }
      const existing = campaigns.find((item) => item.title === parsed.title);
      const next = existing ? mergeCampaigns(existing, parsed) : parsed;
      setCampaigns(upsertTracker(next));
      setCampaignId(next.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯入失敗");
    }
  };

  const onDrop = (event: DragEvent, into: TrackerCampaign | null) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void importFile(file, into);
  };

  if (!campaign) {
    return (
      <section className="tracker-page">
        <div className="page-head">
          <div>
            <h1>追蹤</h1>
            <p>丟 Excel 會自動建追蹤表。之後同一份再匯入會合併，不會刪舊專案。</p>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <label className="panel tracker-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, null)}>
          <strong>把追蹤 Excel 拖到這裡，或點擊選檔</strong>
          <span className="hint">欄位需有 Product Name 與 Wave。Wave 日期列也會一併讀進來。</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file, null);
              e.target.value = "";
            }}
          />
        </label>
        <div className="guide-list" style={{ marginTop: 16 }}>
          {campaigns.map((item) => (
            <button key={item.id} className="panel guide-card" type="button" onClick={() => setCampaignId(item.id)}>
              <h2>{item.title}</h2>
              <p>{item.rows.length} 個專案 · {item.waves.length} 個 Wave</p>
              <span className="ok-pill">開啟</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const yes = campaign.rows.filter((row) => row.affected === "YES").length;

  return (
    <section className="tracker-page">
      <div className="page-head">
        <div>
          <p className="guide-kicker">追蹤</p>
          <h1>{campaign.title}</h1>
          <p>{campaign.note}</p>
        </div>
        <div className="row">
          <button className="btn" type="button" onClick={() => setCampaignId(null)}>全部追蹤表</button>
          <button className="btn btn-gold" type="button" onClick={() => downloadExcel(campaign)}>
            下載 Excel
          </button>
        </div>
      </div>

      <div className="tracker-stats">
        <span>專案 {campaign.rows.length}</span>
        <span>Affected YES {yes}</span>
        <span>Wave {campaign.waves.length}</span>
      </div>

      <div className={`panel tracker-waves${wavesOpen ? "" : " is-collapsed"}`}>
        <div className="tracker-waves-head">
          <button className="tracker-waves-toggle" type="button" onClick={toggleWaves} aria-expanded={wavesOpen}>
            <strong>Wave 預計時間</strong>
            <span className="hint">{campaign.waves.length} 個{wavesOpen ? " · 點擊收合" : " · 已隱藏"}</span>
          </button>
          <label className="tracker-deadline-field">
            <span>Deadline</span>
            <input
              type="date"
              value={campaignDeadline(campaign)}
              onChange={(e) => save({ ...campaign, deadline: e.target.value })}
            />
          </label>
          <div className="row">
            {wavesOpen && (
              <button className="btn btn-gold" type="button" onClick={() => addWave()}>新增 Wave</button>
            )}
            <button className="btn" type="button" onClick={toggleWaves}>{wavesOpen ? "隱藏" : "展開"}</button>
          </div>
        </div>
        {wavesOpen && (
          <div className="table-wrap tracker-wave-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Wave</th>
                  <th>預計開始</th>
                  <th>預計結束</th>
                  <th>專案</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaign.waves.map((wave) => (
                  <tr key={wave.id}>
                    <td>
                      <input
                        aria-label="Wave 名稱"
                        value={wave.name}
                        onChange={(e) => patchWave(wave.id, { name: e.target.value })}
                      />
                    </td>
                    <td className={wave.start ? undefined : "date-empty"}>
                      <input
                        type="date"
                        aria-label={`${wave.name} 開始`}
                        value={wave.start}
                        onChange={(e) => patchWave(wave.id, { start: e.target.value })}
                      />
                    </td>
                    <td className={wave.end ? undefined : "date-empty"}>
                      <input
                        type="date"
                        aria-label={`${wave.name} 結束`}
                        value={wave.end}
                        onChange={(e) => patchWave(wave.id, { end: e.target.value })}
                      />
                    </td>
                    <td className="tracker-no">{campaign.rows.filter((row) => row.wave === wave.name).length}</td>
                    <td>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => save({ ...campaign, waves: campaign.waves.filter((item) => item.id !== wave.id) })}
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="guide-toc" aria-label="檢視">
        <button className={tab === "table" ? "on" : ""} type="button" onClick={() => setTab("table")}>總表</button>
        <button className={tab === "gantt" ? "on" : ""} type="button" onClick={() => setTab("gantt")}>甘特圖</button>
        <button className={tab === "waves" ? "on" : ""} type="button" onClick={() => setTab("waves")}>Wave 日期</button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === "table" && (
        <div className="panel">
          <div className="row tracker-filters">
            <input placeholder="搜尋產品 / MT / SA / DQA / PM / BIOS" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={waveFilter} onChange={(e) => setWaveFilter(e.target.value)} aria-label="Wave">
              <option value="">全部 Wave</option>
              {campaign.waves.map((wave) => (
                <option key={wave.id} value={wave.name}>{wave.name}</option>
              ))}
            </select>
            <select value={affectedFilter} onChange={(e) => setAffectedFilter(e.target.value)} aria-label="Affected">
              <option value="">全部 Affected</option>
              {AFFECTED_OPTIONS.filter(Boolean).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button
              className="btn"
              type="button"
              onClick={() => save({ ...campaign, rows: [...campaign.rows, emptyRow({ no: String(campaign.rows.length + 1) })] })}
            >
              新增專案
            </button>
            <button className="btn btn-gold" type="button" onClick={() => downloadExcel(campaign)}>
              下載 Excel
            </button>
            <label className="btn">
              再匯入 Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file, campaign);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="table-wrap tracker-table">
            <table className="table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Product</th>
                  <th>Code</th>
                  <th>MT</th>
                  <th>Platform</th>
                  <th>Affected</th>
                  <th>SA</th>
                  <th>DQA</th>
                  <th>PM</th>
                  <th>BIOS</th>
                  <th>BIOS Ver</th>
                  <th>預計 Release</th>
                  <th>Wave</th>
                  <th>SA Pre</th>
                  <th>Test start</th>
                  <th>Test end</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const no = campaign.rows.findIndex((item) => item.id === row.id) + 1;
                  const releaseState = releaseVsWave(row, campaign.waves);
                  const releaseClass = releaseState ? `release-${releaseState}` : "";
                  const wave = campaign.waves.find((item) => item.name === row.wave);
                  const releaseTitle = releaseState === "late"
                    ? `Release ${row.release} 超過 ${row.wave}（${wave?.end ?? ""}）`
                    : releaseState === "ok"
                      ? `Release ${row.release} 在 ${row.wave} 預計時間內`
                      : undefined;
                  return (
                  <tr key={row.id}>
                    <td className="tracker-no">{no || row.no}</td>
                    <td className="tracker-product">
                      <input value={row.product} onChange={(e) => patchRow(row.id, { product: e.target.value })} />
                    </td>
                    <td className="tracker-code"><input value={row.code} onChange={(e) => patchRow(row.id, { code: e.target.value })} /></td>
                    <td className="tracker-mt"><input value={row.mt} onChange={(e) => patchRow(row.id, { mt: e.target.value })} /></td>
                    <td className="tracker-platform"><input value={row.platform} onChange={(e) => patchRow(row.id, { platform: e.target.value })} /></td>
                    <td>
                      <select value={row.affected} onChange={(e) => patchRow(row.id, { affected: e.target.value })}>
                        {AFFECTED_OPTIONS.map((item) => (
                          <option key={item || "empty"} value={item}>{item || "—"}</option>
                        ))}
                      </select>
                    </td>
                    <td className="tracker-owner"><input value={row.saOwner} onChange={(e) => patchRow(row.id, { saOwner: e.target.value })} /></td>
                    <td className="tracker-owner"><input value={row.dqaOwner} onChange={(e) => patchRow(row.id, { dqaOwner: e.target.value })} /></td>
                    <td className="tracker-owner"><input value={pmName(row)} onChange={(e) => patchRow(row.id, { pmOwner: e.target.value, owner: e.target.value })} /></td>
                    <td className="tracker-owner"><input value={row.biosOwner} onChange={(e) => patchRow(row.id, { biosOwner: e.target.value })} /></td>
                    <td className={`tracker-bios ${releaseClass}`} title={releaseTitle}>
                      <input value={row.bios} onChange={(e) => patchRow(row.id, { bios: e.target.value })} />
                    </td>
                    <td className={dateTone("tracker-date", releaseClass, !row.release && "date-empty")} title={releaseTitle}>
                      <input type="date" value={row.release} onChange={(e) => patchRow(row.id, { release: e.target.value })} />
                    </td>
                    <td className="tracker-wave">
                      <select value={row.wave} onChange={(e) => patchRow(row.id, { wave: e.target.value })}>
                        <option value="">—</option>
                        {campaign.waves.map((wave) => (
                          <option key={wave.id} value={wave.name}>{wave.name}</option>
                        ))}
                        {row.wave && !campaign.waves.some((wave) => wave.name === row.wave) && (
                          <option value={row.wave}>{row.wave}</option>
                        )}
                      </select>
                    </td>
                    <td className={dateTone("tracker-date", !row.saPre && "date-empty")}>
                      <input type="date" value={row.saPre} onChange={(e) => patchRow(row.id, { saPre: e.target.value })} />
                    </td>
                    <td className={dateTone("tracker-date", !row.testStart && "date-empty")}>
                      <input type="date" value={row.testStart} onChange={(e) => patchRow(row.id, { testStart: e.target.value })} />
                    </td>
                    <td className={dateTone("tracker-date", !row.testEnd && "date-empty")}>
                      <input type="date" value={row.testEnd} onChange={(e) => patchRow(row.id, { testEnd: e.target.value })} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "gantt" && (
        <div className="panel">
          <TrackerGantt
            campaign={campaign}
            rows={visible.filter((row) => row.affected !== "NO")}
            onDates={(id, start, end) => patchRow(id, { testStart: start, testEnd: end })}
          />
        </div>
      )}

      {tab === "waves" && (
        <div className="panel">
          <p className="hint">預計時間在上方改。這裡看各 Wave 有幾個專案。</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Wave</th>
                  <th>預計開始</th>
                  <th>預計結束</th>
                  <th>專案數</th>
                </tr>
              </thead>
              <tbody>
                {campaign.waves.map((wave) => (
                  <tr key={wave.id}>
                    <td>{wave.name}</td>
                    <td>{wave.start || "—"}</td>
                    <td>{wave.end || "—"}</td>
                    <td>{campaign.rows.filter((row) => row.wave === wave.name).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 16 }}>不要的追蹤表：
            <button
              className="ghost"
              type="button"
              onClick={() => {
                if (!window.confirm(`刪除「${campaign.title}」？`)) return;
                const next = removeTracker(campaign.id);
                setCampaigns(next);
                setCampaignId(next[0]?.id ?? null);
              }}
            >
              刪除這份表
            </button>
          </p>
        </div>
      )}
    </section>
  );
}
