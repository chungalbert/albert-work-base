/** BIOS Security Updates — cycles, project roster, reusable issue cards. */

export type SecurityRosterStatus =
  | "Not Started"
  | "Internal release"
  | "SA BVT"
  | "Completed";

export type SecurityCycle = {
  id: string;
  name: string;
  cycle_type: string;
  quarter: string;
  wave1_date: string;
  wave2_date: string;
  external_release_date: string;
  /** Project ids included in this cycle (roster rows). */
  project_ids: string[];
  created_at: string;
  updated_at: string;
};

export type SecurityRosterEntry = {
  id: string;
  cycle_id: string;
  project_id: string;
  project_name: string;
  wave: string;
  owner_id: string | null;
  reviewer_id: string | null;
  status: SecurityRosterStatus;
  sort_order: number;
};

export type SecurityIssue = {
  id: string;
  title: string;
  oem_request_id: string;
  detail: string;
  cycle_ids: string[];
  project_ids: string[];
  /** Display codes (comma-joined), kept for roster-less projects. */
  project_names: string;
  created_at: string;
  updated_at: string;
};

export type SecuritySnapshot = {
  cycles: SecurityCycle[];
  roster: SecurityRosterEntry[];
  issues: SecurityIssue[];
};

export type NewCycleInput = {
  name: string;
  cycle_type: string;
  quarter: string;
  wave1_date: string;
  wave2_date: string;
  external_release_date: string;
  /** Selected projects: id + display name (+ optional platform blurb unused in roster). */
  projects: { id: string; name: string }[];
};

export type SecurityIssueInput = {
  title: string;
  oem_request_id?: string;
  detail?: string;
  cycle_ids?: string[];
  project_ids?: string[];
  project_names?: string;
};

export const SECURITY_STATUSES: SecurityRosterStatus[] = [
  "Not Started",
  "Internal release",
  "SA BVT",
  "Completed",
];

export const WAVE_OPTIONS = ["Not set", "Wave 1", "Wave 2"] as const;
