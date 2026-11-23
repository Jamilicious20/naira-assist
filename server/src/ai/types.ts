/**
 * Provider-neutral message types. They mirror the Anthropic Messages API shape,
 * so the Anthropic adapter is thin, but nothing outside ai/anthropic.ts imports the SDK.
 */
export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface LlmMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };
}

export interface LlmResponse {
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  content: ContentBlock[];
}

export interface LlmClient {
  complete(req: { system: string; messages: LlmMessage[]; tools: ToolSpec[] }): Promise<LlmResponse>;
}
