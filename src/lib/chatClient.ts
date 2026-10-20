import type { ChatMessage } from "./types";

/**
 * Chat model client boundary.
 *
 * Today: local placeholder replies (no network, no API keys).
 * Later: swap `placeholderChatClient` for a Grok / xAI implementation that
 * implements the same `ChatClient` interface and is selected in ChatPage’s
 * send path (e.g. `const client = getChatClient()`).
 */
export interface ChatClient {
  /** Generate an assistant reply for the current conversation transcript. */
  complete(messages: ChatMessage[]): Promise<string>;
}

const PLACEHOLDER_REPLY = "模型尚未接上（之後接 Grok）";

export const placeholderChatClient: ChatClient = {
  async complete(_messages: ChatMessage[]): Promise<string> {
    // Intentionally offline — replace with Grok/xAI HTTP call later.
    return PLACEHOLDER_REPLY;
  },
};

/** Active client used by the Chat UI send path. */
export function getChatClient(): ChatClient {
  // Future: if (import.meta.env.VITE_XAI_API_KEY) return grokChatClient;
  return placeholderChatClient;
}
