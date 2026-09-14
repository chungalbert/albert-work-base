import { formatTaipeiDateTime } from "./dates";
import type { AnalyzedNote, Profile, Task } from "./types";

export function makeAnalyzedNote(text: string, userId: string): AnalyzedNote {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    by: userId,
    at: new Date().toISOString(),
  };
}

export function normalizeAnalyzedNotes(task: {
  analyzed?: string;
  analyzed_by?: string | null;
  analyzed_at?: string | null;
  analyzed_notes?: AnalyzedNote[] | null;
}): AnalyzedNote[] {
  const fromJson = (Array.isArray(task.analyzed_notes) ? task.analyzed_notes : [])
    .map((note) => ({
      id: String(note?.id ?? crypto.randomUUID()),
      text: String(note?.text ?? "").trim(),
      by: note?.by ?? null,
      at: note?.at ? String(note.at) : null,
    }))
    .filter((note) => note.text);
  if (fromJson.length) return fromJson;

  const text = (task.analyzed ?? "").trim();
  if (!text) return [];
  return [{
    id: task.analyzed_at ?? "legacy",
    text,
    by: task.analyzed_by ?? null,
    at: task.analyzed_at ?? null,
  }];
}

export function syncAnalyzedFields(
  notes: AnalyzedNote[],
): Pick<Task, "analyzed" | "analyzed_by" | "analyzed_at" | "analyzed_notes"> {
  const analyzed_notes = notes
    .map((note) => ({ ...note, text: note.text.trim() }))
    .filter((note) => note.text);
  const last = analyzed_notes[analyzed_notes.length - 1];
  return {
    analyzed_notes,
    analyzed: analyzed_notes.map((note) => note.text).join("\n\n"),
    analyzed_by: last?.by ?? null,
    analyzed_at: last?.at ?? null,
  };
}

export function addAnalyzedNote(notes: AnalyzedNote[], text: string, userId: string): AnalyzedNote[] {
  const next = text.trim();
  if (!next) return notes;
  return [...notes, makeAnalyzedNote(next, userId)];
}

export function updateAnalyzedNote(
  notes: AnalyzedNote[],
  id: string,
  text: string,
  userId: string,
): AnalyzedNote[] {
  const next = text.trim();
  return notes.flatMap((note) => {
    if (note.id !== id) return [note];
    if (!next) return [];
    if (next === note.text) return [note];
    return [{ ...note, text: next, by: userId, at: new Date().toISOString() }];
  });
}

export function analyzedNoteCredit(
  note: Pick<AnalyzedNote, "by" | "at">,
  profiles: Pick<Profile, "id" | "display_name">[],
): string | null {
  if (!note.at) return null;
  const name = profiles.find((p) => p.id === note.by)?.display_name ?? "未知";
  return `${name} · ${formatTaipeiDateTime(note.at)}`;
}
