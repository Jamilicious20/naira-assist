import { describe, expect, it } from "vitest";
import type { LlmMessage } from "../src/ai/types.js";
import { HttpError, isRetryableHttpError, TimeoutError, withRetry, withTimeout } from "../src/lib/retry.js";
import { InMemoryConversationStore, trimHistory } from "../src/store/conversations.js";

const user = (t: string): LlmMessage => ({ role: "user", content: [{ type: "text", text: t }] });
const assistant = (t: string): LlmMessage => ({ role: "assistant", content: [{ type: "text", text: t }] });
const toolCall: LlmMessage = { role: "assistant", content: [{ type: "tool_use", id: "t", name: "get_balance", input: {} }] };
const toolResult: LlmMessage = { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "{}" }] };

describe("trimHistory", () => {
  it("never starts the window on an orphaned tool result", () => {
    const history = [user("1"), assistant("1"), user("2"), toolCall, toolResult, assistant("2"), user("3"), assistant("3")];
    const trimmed = trimHistory(history, 5); // naive cut would start at toolCall
    expect(trimmed[0]).toEqual(user("3"));
  });

  it("leaves short histories alone", () => {
    const history = [user("1"), assistant("1")];
    expect(trimHistory(history, 10)).toBe(history);
  });
});

describe("InMemoryConversationStore", () => {
  it("expires idle conversations", async () => {
    let now = 0;
    const store = new InMemoryConversationStore(30, 1000, () => now);
    await store.save("c1", [user("hi")]);
    now = 500;
    expect(await store.load("c1")).toHaveLength(1);
    now = 2000;
    expect(await store.load("c1")).toEqual([]);
  });
});

describe("withRetry", () => {
  const noSleep = async () => {};

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new HttpError(503, "busy");
        return "ok";
      },
      { sleep: noSleep, shouldRetry: isRetryableHttpError },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry client errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new HttpError(400, "bad");
        },
        { sleep: noSleep, shouldRetry: isRetryableHttpError },
      ),
    ).rejects.toThrow("bad");
    expect(calls).toBe(1);
  });
});

describe("withTimeout", () => {
  it("aborts slow operations", async () => {
    await expect(
      withTimeout(20, (signal) => new Promise((_r, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});
