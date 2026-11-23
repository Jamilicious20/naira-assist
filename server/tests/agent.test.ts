import { describe, expect, it } from "vitest";
import { runAgent } from "../src/ai/agent.js";
import { StaticRates } from "../src/ai/tools.js";
import type { ToolResultBlock } from "../src/ai/types.js";
import { InMemoryLedger } from "../src/store/ledger.js";
import { ScriptedLlm, text, toolUse } from "./helpers.js";

const ctx = { userId: "user-123", ledger: new InMemoryLedger(), rates: new StaticRates() };

describe("runAgent", () => {
  it("runs a requested tool and feeds the result back to the model", async () => {
    const llm = new ScriptedLlm([toolUse({ id: "t1", name: "get_balance" }), text("You have ₦220,000.00.")]);
    const result = await runAgent({ llm, history: [], userText: "What's my balance?", ctx });

    expect(result.reply).toBe("You have ₦220,000.00.");
    expect(result.toolCalls).toEqual([{ name: "get_balance", isError: false }]);
    const toolResult = llm.calls[1]!.at(-1)!.content[0] as ToolResultBlock;
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(toolResult.content).toContain("220,000.00");
  });

  it("answers several tool calls from one model turn in a single message", async () => {
    const llm = new ScriptedLlm([
      toolUse({ id: "a", name: "get_balance" }, { id: "b", name: "convert_currency", input: { amount: 1000, from: "USD", to: "NGN" } }),
      text("done"),
    ]);
    await runAgent({ llm, history: [], userText: "balance and 1000 USD in naira", ctx });
    const results = llm.calls[1]!.at(-1)!.content as ToolResultBlock[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["a", "b"]);
  });

  it("returns tool errors to the model so it can recover", async () => {
    const llm = new ScriptedLlm([toolUse({ id: "x", name: "list_transactions", input: { limit: "lots" } }), text("Here are your latest five.")]);
    const result = await runAgent({ llm, history: [], userText: "show transactions", ctx });
    expect(result.toolCalls[0]!.isError).toBe(true);
    expect(llm.calls[1]!.at(-1)!.content[0]).toMatchObject({ is_error: true });
    expect(result.reply).toBe("Here are your latest five.");
  });

  it("stops at the step limit and still leaves valid history", async () => {
    const loop = () => toolUse({ id: crypto.randomUUID(), name: "get_balance" });
    const llm = new ScriptedLlm([loop, loop, loop]);
    const result = await runAgent({ llm, history: [], userText: "hi", ctx, maxSteps: 3 });
    expect(llm.calls).toHaveLength(3);
    expect(result.messages.at(-1)).toMatchObject({ role: "assistant", content: [{ type: "text" }] });
  });

  it("includes earlier turns so follow-up questions have context", async () => {
    const llm = new ScriptedLlm([text("first"), text("second")]);
    const first = await runAgent({ llm, history: [], userText: "Hi", ctx });
    await runAgent({ llm, history: first.messages, userText: "And again?", ctx });
    expect(llm.calls[1]).toHaveLength(3); // user, assistant, user
  });
});
