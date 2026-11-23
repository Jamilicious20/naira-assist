import { executeTool, toolSpecs, type ToolContext } from "./tools.js";
import type { LlmClient, LlmMessage, ToolResultBlock } from "./types.js";

export const SYSTEM_PROMPT = `You are Naira Assist, the in-app assistant for a Nigerian digital wallet.
- Answer questions about the user's balance, transactions and exchange rates using the tools. Never guess figures.
- You cannot send, transfer or withdraw money. If asked, explain that payments are made from the Send screen in the app, where the user confirms them.
- Explain pending and failed transactions plainly. Failed debits are refunded automatically; pending ones usually settle within 24 hours.
- Keep replies short enough for a chat bubble or WhatsApp message. Use ₦ for Naira.
- Never ask for or repeat PINs, passwords, card numbers or OTPs.`;

export interface AgentResult {
  reply: string;
  /** Full history including this turn, ready to persist. */
  messages: LlmMessage[];
  toolCalls: { name: string; isError: boolean }[];
}

/**
 * One user turn: call the model, run any tools it requests, feed results back,
 * and repeat until it answers in text or hits the step limit.
 */
export async function runAgent(params: {
  llm: LlmClient;
  history: LlmMessage[];
  userText: string;
  ctx: ToolContext;
  maxSteps?: number;
}): Promise<AgentResult> {
  const { llm, ctx, maxSteps = 5 } = params;
  const messages: LlmMessage[] = [...params.history, { role: "user", content: [{ type: "text", text: params.userText }] }];
  const toolCalls: AgentResult["toolCalls"] = [];

  for (let step = 0; step < maxSteps; step++) {
    const res = await llm.complete({ system: SYSTEM_PROMPT, messages, tools: toolSpecs });
    messages.push({ role: "assistant", content: res.content });

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (res.stopReason !== "tool_use" || toolUses.length === 0) {
      const reply = res.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "Sorry, I couldn't put an answer together. Please try again.", messages, toolCalls };
    }

    // Independent tool calls run in parallel; results go back in one user turn.
    const results: ToolResultBlock[] = await Promise.all(
      toolUses.map(async (use) => {
        const { content, isError } = await executeTool(use.name, use.input, ctx);
        toolCalls.push({ name: use.name, isError });
        return { type: "tool_result" as const, tool_use_id: use.id, content, ...(isError ? { is_error: true } : {}) };
      }),
    );
    messages.push({ role: "user", content: results });
  }

  // Step limit reached: close the turn with a plain answer so history stays valid.
  const reply = "That took more steps than expected. Could you ask in a simpler way?";
  messages.push({ role: "assistant", content: [{ type: "text", text: reply }] });
  return { reply, messages, toolCalls };
}
