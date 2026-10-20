import type { ChatConversation, ChatMessage, ChatRole } from "./types";

const KEY = "awb-chat-v1";

interface ChatState {
  conversations: ChatConversation[];
  activeId: string | null;
}

function empty(): ChatState {
  return { conversations: [], activeId: null };
}

function load(): ChatState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as ChatState;
    const conversations = Array.isArray(parsed.conversations) ? parsed.conversations : [];
    const activeId =
      parsed.activeId && conversations.some((c) => c.id === parsed.activeId)
        ? parsed.activeId
        : conversations[0]?.id ?? null;
    return { conversations, activeId };
  } catch {
    return empty();
  }
}

function save(state: ChatState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function nowIso() {
  return new Date().toISOString();
}

function makeMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    created_at: nowIso(),
  };
}

function titleFromFirstUserMessage(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = (first?.content ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "New chat";
  return text.length > 36 ? `${text.slice(0, 36)}…` : text;
}

export const chatStore = {
  listConversations(): ChatConversation[] {
    return [...load().conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  getActiveId(): string | null {
    return load().activeId;
  },

  getActive(): ChatConversation | null {
    const state = load();
    return state.conversations.find((c) => c.id === state.activeId) ?? null;
  },

  setActive(id: string) {
    const state = load();
    if (!state.conversations.some((c) => c.id === id)) throw new Error("Conversation not found");
    state.activeId = id;
    save(state);
  },

  createConversation(): ChatConversation {
    const state = load();
    const ts = nowIso();
    const conversation: ChatConversation = {
      id: crypto.randomUUID(),
      title: "New chat",
      messages: [],
      created_at: ts,
      updated_at: ts,
    };
    state.conversations.unshift(conversation);
    state.activeId = conversation.id;
    save(state);
    return conversation;
  },

  ensureActive(): ChatConversation {
    const active = chatStore.getActive();
    if (active) return active;
    return chatStore.createConversation();
  },

  appendMessage(conversationId: string, role: ChatRole, content: string): ChatConversation {
    const state = load();
    const idx = state.conversations.findIndex((c) => c.id === conversationId);
    if (idx < 0) throw new Error("Conversation not found");
    const conversation = state.conversations[idx];
    const message = makeMessage(role, content);
    conversation.messages = [...conversation.messages, message];
    conversation.updated_at = message.created_at;
    if (role === "user" && conversation.title === "New chat") {
      conversation.title = titleFromFirstUserMessage(conversation.messages);
    }
    state.conversations[idx] = conversation;
    state.activeId = conversation.id;
    save(state);
    return conversation;
  },

  deleteConversation(id: string) {
    const state = load();
    state.conversations = state.conversations.filter((c) => c.id !== id);
    if (state.activeId === id) {
      state.activeId = state.conversations[0]?.id ?? null;
    }
    save(state);
  },
};
