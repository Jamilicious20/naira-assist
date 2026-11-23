import { create } from "zustand";
import { userMessage, type ChatResponse } from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "sending" | "sent" | "failed";
  error?: string;
}

interface ChatState {
  messages: ChatMessage[];
  conversationId?: string;
  isReplying: boolean;
  send: (text: string) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  reset: () => void;
}

type SendFn = (message: string, conversationId?: string) => Promise<ChatResponse>;

let counter = 0;
const newId = () => `m_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/** Factory so tests can inject a fake sender; the app uses `useChatStore` below. */
export function createChatStore(sendFn: SendFn) {
  return create<ChatState>()((set, get) => {
    async function deliver(messageId: string, text: string) {
      set({ isReplying: true });
      try {
        const res = await sendFn(text, get().conversationId);
        set((s) => ({
          conversationId: res.conversationId,
          messages: [
            ...s.messages.map((m) => (m.id === messageId ? { ...m, status: "sent" as const } : m)),
            { id: newId(), role: "assistant", text: res.reply, status: "sent" },
          ],
        }));
      } catch (err) {
        set((s) => ({
          messages: s.messages.map((m) => (m.id === messageId ? { ...m, status: "failed" as const, error: userMessage(err) } : m)),
        }));
      } finally {
        set({ isReplying: false });
      }
    }

    return {
      messages: [],
      conversationId: undefined,
      isReplying: false,

      async send(raw) {
        const text = raw.trim();
        if (!text || get().isReplying) return; // one turn at a time keeps server history in order
        const id = newId();
        // Optimistic: the user's bubble appears immediately.
        set((s) => ({ messages: [...s.messages, { id, role: "user", text, status: "sending" }] }));
        await deliver(id, text);
      },

      async retry(messageId) {
        const msg = get().messages.find((m) => m.id === messageId);
        if (!msg || msg.status !== "failed" || get().isReplying) return;
        set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, status: "sending" as const, error: undefined } : m)) }));
        await deliver(messageId, msg.text);
      },

      reset: () => set({ messages: [], conversationId: undefined, isReplying: false }),
    };
  });
}
