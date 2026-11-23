import type { ContentBlock, LlmClient, LlmMessage, LlmResponse } from "../src/ai/types.js";

/** An LLM stand-in that replays scripted responses and records what it was sent. */
export class ScriptedLlm implements LlmClient {
  readonly calls: LlmMessage[][] = [];
  constructor(private readonly script: Array<LlmResponse | ((messages: LlmMessage[]) => LlmResponse)>) {}

  async complete({ messages }: { messages: LlmMessage[] }): Promise<LlmResponse> {
    this.calls.push(structuredClone(messages));
    const next = this.script.shift();
    if (!next) throw new Error("ScriptedLlm ran out of responses");
    return typeof next === "function" ? next(messages) : next;
  }
}

export const text = (t: string): LlmResponse => ({ stopReason: "end_turn", content: [{ type: "text", text: t }] });

export const toolUse = (...uses: Array<{ id: string; name: string; input?: unknown }>): LlmResponse => ({
  stopReason: "tool_use",
  content: uses.map((u): ContentBlock => ({ type: "tool_use", id: u.id, name: u.name, input: u.input ?? {} })),
});
