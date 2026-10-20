import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { getChatClient } from "../lib/chatClient";
import { chatStore } from "../lib/chatStore";
import type { ChatConversation, ChatMessage } from "../lib/types";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatPage({ onGoDashboard }: { onGoDashboard?: () => void }) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refresh = () => {
    const list = chatStore.listConversations();
    setConversations(list);
    setActiveId(chatStore.getActiveId());
  };

  useEffect(() => {
    chatStore.ensureActive();
    refresh();
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages: ChatMessage[] = active?.messages ?? [];

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  const onNewChat = () => {
    chatStore.createConversation();
    setDraft("");
    setError("");
    refresh();
    inputRef.current?.focus();
  };

  const onSelect = (id: string) => {
    chatStore.setActive(id);
    setError("");
    refresh();
  };

  const onDelete = (id: string) => {
    const ok = window.confirm("Delete this conversation?");
    if (!ok) return;
    chatStore.deleteConversation(id);
    chatStore.ensureActive();
    refresh();
  };

  const onSend = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setError("");
    setBusy(true);
    setDraft("");
    try {
      const conversation = chatStore.ensureActive();
      const withUser = chatStore.appendMessage(conversation.id, "user", text);
      refresh();

      // Swap getChatClient() later for a real Grok/xAI client — same ChatClient interface.
      const reply = await getChatClient().complete(withUser.messages);
      chatStore.appendMessage(withUser.id, "assistant", reply);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSend();
    }
  };

  return (
    <div className="chat-page">
      <header className="chat-toolbar">
        <nav className="chat-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="chat-bc-home" onClick={onGoDashboard} aria-label="Dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </button>
          <button type="button" className="chat-bc-link" onClick={onGoDashboard}>
            Dashboard
          </button>
          <span className="chat-bc-sep" aria-hidden="true">›</span>
          <span className="chat-bc-current">Chat</span>
        </nav>
        <div className="chat-toolbar-actions">
          <button type="button" className="chat-new-btn" onClick={onNewChat}>
            + New chat
          </button>
        </div>
      </header>

      <div className="chat-body">
        <aside className="chat-sidebar" aria-label="Conversations">
          <p className="chat-sidebar-label">Conversations</p>
          <ul className="chat-conv-list">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`chat-conv-item${c.id === activeId ? " on" : ""}`}
                  onClick={() => onSelect(c.id)}
                >
                  <span className="chat-conv-title">{c.title}</span>
                  <span className="chat-conv-meta">{c.messages.length} msg</span>
                </button>
                <button
                  type="button"
                  className="chat-conv-delete"
                  title="Delete"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => onDelete(c.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="chat-main">
          <div className="chat-messages" ref={listRef} role="log" aria-live="polite">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <h2>Chat</h2>
                <p>Ask anything. Replies are placeholders until Grok is connected.</p>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`chat-bubble-row ${m.role}`}>
                  <div className={`chat-bubble ${m.role}`}>
                    <p>{m.content}</p>
                    <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="chat-bubble-row assistant">
                <div className="chat-bubble assistant pending">
                  <p>…</p>
                </div>
              </div>
            )}
          </div>

          {error && <p className="chat-error">{error}</p>}

          <form className="chat-composer" onSubmit={(e) => void onSend(e)}>
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message… (Enter to send, Shift+Enter for newline)"
              disabled={busy}
              aria-label="Message"
            />
            <button type="submit" className="chat-send-btn" disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
