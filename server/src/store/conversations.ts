import type { LlmMessage } from "../ai/types.js";

export interface ConversationStore {
  load(conversationId: string): Promise<LlmMessage[]>;
  save(conversationId: string, messages: LlmMessage[]): Promise<void>;
}

/**
 * Keeps the most recent part of a conversation within a message budget.
 * The kept window always starts on a plain user turn, so a tool_result is never
 * separated from the tool_use that produced it (the LLM API rejects that).
 */
export function trimHistory(messages: LlmMessage[], maxMessages: number): LlmMessage[] {
  if (messages.length <= maxMessages) return messages;
  let start = messages.length - maxMessages;
  while (start < messages.length) {
    const m = messages[start]!;
    const isPlainUserTurn = m.role === "user" && m.content.every((b) => b.type === "text");
    if (isPlainUserTurn) break;
    start++;
  }
  return messages.slice(start);
}

export class InMemoryConversationStore implements ConversationStore {
  private readonly data = new Map<string, { messages: LlmMessage[]; updatedAt: number }>();

  constructor(
    private readonly maxMessages = 30,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  async load(conversationId: string): Promise<LlmMessage[]> {
    const entry = this.data.get(conversationId);
    if (!entry) return [];
    if (this.now() - entry.updatedAt > this.ttlMs) {
      this.data.delete(conversationId);
      return [];
    }
    return structuredClone(entry.messages);
  }

  async save(conversationId: string, messages: LlmMessage[]): Promise<void> {
    this.data.set(conversationId, {
      messages: trimHistory(structuredClone(messages), this.maxMessages),
      updatedAt: this.now(),
    });
  }
}
