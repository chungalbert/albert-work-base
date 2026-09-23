import seed from "../content/ipu4Seed.json";
import { emptyRow, type TrackerCampaign, type TrackerRow } from "./trackerTypes";

const KEY = "awb-trackers-v1";
const SEED_REV = "2026-09-23-compal0923-2";
const SEED_REV_KEY = "awb-tracker-seed-rev";

function normalizeRow(row: Partial<TrackerRow>): TrackerRow {
  const next = { ...emptyRow(), ...row, impacts: row.impacts ?? {} };
  next.pmOwner = next.pmOwner || next.owner;
  return next;
}

function normalize(campaigns: TrackerCampaign[]): TrackerCampaign[] {
  return campaigns.map((campaign) => ({
    ...campaign,
    deadline: campaign.deadline || `${campaign.year || 2026}-10-25`,
    waves: campaign.waves ?? [],
    issues: campaign.issues ?? [],
    rows: (campaign.rows ?? []).map(normalizeRow),
  }));
}

function read(): TrackerCampaign[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackerCampaign[];
    return Array.isArray(parsed) ? normalize(parsed) : [];
  } catch {
    return [];
  }
}

function write(campaigns: TrackerCampaign[]) {
  localStorage.setItem(KEY, JSON.stringify(campaigns));
}

export function listTrackers(): TrackerCampaign[] {
  const current = read();
  const applied = localStorage.getItem(SEED_REV_KEY);
  const bundled = normalize([seed as unknown as TrackerCampaign])[0];
  if (current.length === 0) {
    write([bundled]);
    localStorage.setItem(SEED_REV_KEY, SEED_REV);
    return [bundled];
  }
  if (applied !== SEED_REV) {
    const next = normalize([bundled, ...current.filter((item) => item.id !== bundled.id)]);
    write(next);
    localStorage.setItem(SEED_REV_KEY, SEED_REV);
    return next;
  }
  return current;
}

export function saveTrackers(campaigns: TrackerCampaign[]) {
  write(campaigns);
}

export function upsertTracker(next: TrackerCampaign): TrackerCampaign[] {
  const campaigns = listTrackers();
  const index = campaigns.findIndex((item) => item.id === next.id);
  const stamped = { ...next, updatedAt: new Date().toISOString() };
  if (index >= 0) campaigns[index] = stamped;
  else campaigns.unshift(stamped);
  write(campaigns);
  return campaigns;
}

export function removeTracker(id: string): TrackerCampaign[] {
  const campaigns = listTrackers().filter((item) => item.id !== id);
  write(campaigns);
  return campaigns;
}
