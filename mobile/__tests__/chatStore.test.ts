import { ApiError, type ChatResponse } from "@/lib/api";
import { createChatStore } from "@/stores/chat";

const reply = (text: string, conversationId = "c-1"): ChatResponse => ({ conversationId, reply: text, toolsUsed: [] });

describe("chat store", () => {
  it("shows the user's message immediately, then the reply", async () => {
    let resolve!: (r: ChatResponse) => void;
    const store = createChatStore(() => new Promise((r) => (resolve = r)));

    const pending = store.getState().send("  What's my balance?  ");
    expect(store.getState().messages).toEqual([expect.objectContaining({ role: "user", text: "What's my balance?", status: "sending" })]);
    expect(store.getState().isReplying).toBe(true);

    resolve(reply("₦220,000.00"));
    await pending;
    const { messages, isReplying, conversationId } = store.getState();
    expect(messages.map((m) => [m.role, m.status])).toEqual([
      ["user", "sent"],
      ["assistant", "sent"],
    ]);
    expect(isReplying).toBe(false);
    expect(conversationId).toBe("c-1");
  });

  it("reuses the conversation id for follow-ups", async () => {
    const send = jest.fn().mockResolvedValueOnce(reply("a", "conv-9")).mockResolvedValueOnce(reply("b", "conv-9"));
    const store = createChatStore(send);
    await store.getState().send("one");
    await store.getState().send("two");
    expect(send).toHaveBeenNthCalledWith(1, "one", undefined);
    expect(send).toHaveBeenNthCalledWith(2, "two", "conv-9");
  });

  it("marks failed messages and retries them without duplicating", async () => {
    const send = jest.fn().mockRejectedValueOnce(new ApiError("offline", "down")).mockResolvedValueOnce(reply("back online"));
    const store = createChatStore(send);
    await store.getState().send("hello");

    const failed = store.getState().messages[0]!;
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/offline/);

    await store.getState().retry(failed.id);
    const { messages } = store.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ id: failed.id, status: "sent" });
    expect(messages[1]).toMatchObject({ role: "assistant", text: "back online" });
  });

  it("ignores empty messages and sends while a reply is pending", async () => {
    const send = jest.fn(() => new Promise<ChatResponse>(() => {}));
    const store = createChatStore(send);
    await store.getState().send("   ");
    void store.getState().send("first");
    await store.getState().send("second");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resets everything on sign-out", async () => {
    const store = createChatStore(async () => reply("x"));
    await store.getState().send("hi");
    store.getState().reset();
    expect(store.getState()).toMatchObject({ messages: [], conversationId: undefined, isReplying: false });
  });
});
