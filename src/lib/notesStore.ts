import { api } from "./api";
import type { NoteColor, NoteItem } from "./types";

/**
 * Shared sticky notes for every authenticated member.
 * Local: stored in org `awb-store-v1` (same store as projects).
 * Cloud: Supabase `shared_notes` — RLS allows all authenticated users.
 * No owner / role filtering on list.
 */
export type NoteInput = {
  title: string;
  body: string;
  color: NoteColor;
  url?: string;
};

export const notesStore = {
  async list(): Promise<NoteItem[]> {
    return api.listNotes();
  },

  async create(input: NoteInput): Promise<NoteItem> {
    return api.createNote(input);
  },

  async update(id: string, patch: Partial<NoteInput> & { pinned?: boolean }): Promise<NoteItem> {
    return api.updateNote(id, patch);
  },

  async remove(id: string) {
    await api.removeNote(id);
  },

  async togglePin(id: string): Promise<NoteItem> {
    const notes = await api.listNotes();
    const note = notes.find((n) => n.id === id);
    if (!note) throw new Error("Note not found");
    return api.updateNote(id, { pinned: !note.pinned });
  },
};

/** First http(s) URL in text, used when note has no explicit url. */
export function firstUrlInText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[.,);]+$/, "") : null;
}
