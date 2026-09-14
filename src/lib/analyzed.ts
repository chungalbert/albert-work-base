import { formatTaipeiDateTime } from "./dates";
import type { Profile, Task } from "./types";

type AnalyzedFields = Pick<Task, "analyzed" | "analyzed_by" | "analyzed_at">;

export function stampAnalyzed(
  content: string,
  userId: string,
  previous?: AnalyzedFields,
): AnalyzedFields {
  const analyzed = content.trim();
  if (!analyzed) {
    return { analyzed: "", analyzed_by: null, analyzed_at: null };
  }
  if (previous && previous.analyzed === analyzed) {
    return {
      analyzed,
      analyzed_by: previous.analyzed_by,
      analyzed_at: previous.analyzed_at,
    };
  }
  return {
    analyzed,
    analyzed_by: userId,
    analyzed_at: new Date().toISOString(),
  };
}

export function analyzedCreditLabel(
  task: AnalyzedFields,
  profiles: Pick<Profile, "id" | "display_name">[],
): string | null {
  if (!task.analyzed || !task.analyzed_at) return null;
  const name = profiles.find((p) => p.id === task.analyzed_by)?.display_name ?? "未知";
  return `${name} · ${formatTaipeiDateTime(task.analyzed_at)}`;
}
