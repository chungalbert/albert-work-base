import { NOTE_COLORS, type NoteColor, type NoteItem } from "./types";

const KEY = "awb-notes-v1";

export type NoteInput = {
  title: string;
  body: string;
  color: NoteColor;
  url?: string;
};

function empty(): NoteItem[] {
  return [];
}

function load(): NoteItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as NoteItem[];
    if (!Array.isArray(parsed)) return empty();
    return parsed.map((n) => ({
      id: n.id,
      title: String(n.title ?? ""),
      body: String(n.body ?? ""),
      color: (NOTE_COLORS as readonly string[]).includes(n.color) ? n.color : "blue",
      pinned: Boolean(n.pinned),
      url: n.url?.trim() || undefined,
      created_at: n.created_at || new Date().toISOString(),
      updated_at: n.updated_at || n.created_at || new Date().toISOString(),
    }));
  } catch {
    return empty();
  }
}

function save(notes: NoteItem[]) {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

function sortNotes(notes: NoteItem[]): NoteItem[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export const notesStore = {
  list(): NoteItem[] {
    return sortNotes(load());
  },

  create(input: NoteInput): NoteItem {
    const title = input.title.trim();
    if (!title) throw new Error("Title is required");
    const now = new Date().toISOString();
    const note: NoteItem = {
      id: crypto.randomUUID(),
      title,
      body: input.body.trim(),
      color: input.color,
      pinned: false,
      url: input.url?.trim() || undefined,
      created_at: now,
      updated_at: now,
    };
    const notes = load();
    notes.push(note);
    save(notes);
    return note;
  },

  update(id: string, patch: Partial<NoteInput> & { pinned?: boolean }): NoteItem {
    const notes = load();
    const idx = notes.findIndex((n) => n.id === id);
    if (idx < 0) throw new Error("Note not found");
    const prev = notes[idx];
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error("Title is required");
      prev.title = title;
    }
    if (patch.body !== undefined) prev.body = patch.body.trim();
    if (patch.color !== undefined) prev.color = patch.color;
    if (patch.url !== undefined) prev.url = patch.url.trim() || undefined;
    if (patch.pinned !== undefined) prev.pinned = patch.pinned;
    prev.updated_at = new Date().toISOString();
    notes[idx] = prev;
    save(notes);
    return prev;
  },

  remove(id: string) {
    save(load().filter((n) => n.id !== id));
  },

  togglePin(id: string): NoteItem {
    const notes = load();
    const note = notes.find((n) => n.id === id);
    if (!note) throw new Error("Note not found");
    return notesStore.update(id, { pinned: !note.pinned });
  },
};

/** First http(s) URL in text, used when note has no explicit url. */
export function firstUrlInText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[.,);]+$/, "") : null;
}
