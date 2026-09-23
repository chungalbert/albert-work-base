export interface TrackerIssue {
  id: string;
  title: string;
}

export interface TrackerWave {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface TrackerRow {
  id: string;
  spms: string;
  no: string;
  product: string;
  code: string;
  odm: string;
  ibv: string;
  platform: string;
  mt: string;
  eol: string;
  affected: string;
  bios: string;
  release: string;
  releaseNote: string;
  wave: string;
  saPre: string;
  testStart: string;
  testEnd: string;
  testNote: string;
  ecrb: string;
  signoff: string;
  owner: string;
  pmOwner: string;
  biosOwner: string;
  dqaOwner: string;
  saOwner: string;
  impacts: Record<string, string>;
}

export interface TrackerCampaign {
  id: string;
  title: string;
  note: string;
  year: number;
  deadline: string;
  waves: TrackerWave[];
  issues: TrackerIssue[];
  rows: TrackerRow[];
  updatedAt: string;
}

export const IMPACT_OPTIONS = ["", "Yes", "No", "Drop", "TBD"] as const;
export const AFFECTED_OPTIONS = ["", "YES", "NO", "TBD"] as const;

export function emptyRow(partial?: Partial<TrackerRow>): TrackerRow {
  return {
    id: crypto.randomUUID(),
    spms: "",
    no: "",
    product: "",
    code: "",
    odm: "",
    ibv: "",
    platform: "",
    mt: "",
    eol: "",
    affected: "YES",
    bios: "",
    release: "",
    releaseNote: "",
    wave: "",
    saPre: "",
    testStart: "",
    testEnd: "",
    testNote: "",
    ecrb: "",
    signoff: "",
    owner: "",
    pmOwner: "",
    biosOwner: "",
    dqaOwner: "",
    saOwner: "",
    impacts: {},
    ...partial,
  };
}

export function emptyWave(name: string, start = "", end = ""): TrackerWave {
  return {
    id: crypto.randomUUID(),
    name,
    start,
    end,
  };
}

export function nextWaveName(waves: TrackerWave[]): string {
  const nums = waves.map((wave) => {
    const match = wave.name.match(/wave\s*(\d+)/i);
    return match ? Number(match[1]) : 0;
  });
  return `Wave${Math.max(0, ...nums) + 1}`;
}

export function pmName(row: TrackerRow): string {
  return row.pmOwner || row.owner;
}

export function campaignDeadline(campaign: Pick<TrackerCampaign, "deadline" | "year">): string {
  return campaign.deadline || `${campaign.year || 2026}-10-25`;
}
