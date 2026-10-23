/** Cycle detail matrix (security items × projects) + project release tracking. */

export type ItemApplyStatus = "Applied" | "Not Applied" | "Not Applicable" | "";

/** Per-project cell under a security update item. */
export type ItemApplyCell = {
  status: ItemApplyStatus;
  comment: string;
};

export type CycleDetailItem = {
  id: string;
  title: string;
  /** Secondary line under title (version / path / note). */
  detail: string;
  cycle_comment: string;
  /** project_id → status + comment */
  applies: Record<string, ItemApplyCell>;
  sort_order: number;
};

/** Release tracking row keys — labels in UI. */
export const RELEASE_TRACKING_ROWS = [
  { key: "pcr_request_date", label: "PCR Request Date", kind: "date" },
  { key: "ec_release_date", label: "EC Release Date", kind: "date" },
  { key: "bios_release_date", label: "BIOS Release Date", kind: "date" },
  { key: "bios_version", label: "BIOS Version", kind: "text" },
  { key: "release_comment", label: "Release Comment", kind: "text" },
  { key: "internal_release", label: "Internal Release", kind: "status" },
  { key: "sa_bvt_test", label: "SA BVT Test", kind: "status" },
  /** Renamed from External Release - JY */
  { key: "external_release_web", label: "External Release - Web", kind: "status" },
  { key: "external_release_wu", label: "External Release - WU", kind: "status" },
] as const;

export type ReleaseTrackingKey = (typeof RELEASE_TRACKING_ROWS)[number]["key"];

export type ProjectReleaseCell = Partial<Record<ReleaseTrackingKey, string>>;

export type CycleReleaseTracking = {
  /** project_id → field values */
  by_project: Record<string, ProjectReleaseCell>;
};

export type CycleDetailDoc = {
  cycle_id: string;
  items: CycleDetailItem[];
  release: CycleReleaseTracking;
  updated_at: string;
};

/** Dropdown options (AIOSW). Empty = unset / —. */
export const APPLY_STATUSES: ItemApplyStatus[] = [
  "",
  "Applied",
  "Not Applied",
  "Not Applicable",
];

export const RELEASE_STATUS_OPTIONS = ["", "Ongoing", "Done", "Blocked", "N/A"] as const;

export function emptyApplyCell(): ItemApplyCell {
  return { status: "", comment: "" };
}

export function normalizeApplyStatus(raw: unknown): ItemApplyStatus {
  const s = String(raw ?? "");
  if (s === "Applied" || s === "Not Applied" || s === "Not Applicable") return s;
  return "";
}

/** Accept legacy string status or `{ status, comment }`. */
export function normalizeApplyCell(raw: unknown): ItemApplyCell {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return {
      status: normalizeApplyStatus(o.status ?? o.value ?? ""),
      comment: String(o.comment ?? ""),
    };
  }
  return { status: normalizeApplyStatus(raw), comment: "" };
}

export function emptyCycleDetail(cycleId: string): CycleDetailDoc {
  return {
    cycle_id: cycleId,
    items: [],
    release: { by_project: {} },
    updated_at: new Date().toISOString(),
  };
}

export function newDetailItemId(): string {
  return `cdi-${crypto.randomUUID()}`;
}

export function detailDocSignature(doc: Pick<CycleDetailDoc, "items" | "release">): string {
  return JSON.stringify({ items: doc.items, release: doc.release });
}
