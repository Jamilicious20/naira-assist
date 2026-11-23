import Anthropic from "@anthropic-ai/sdk";
import { HttpError, isRetryableHttpError, withRetry, withTimeout } from "../lib/retry.js";
import type { ContentBlock, LlmClient, LlmResponse } from "./types.js";

export function createAnthropicClient(opts: { apiKey: string; model: string; timeoutMs: number }): LlmClient {
  // SDK retries are disabled so our own retry policy is the only one in play.
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 0 });

  return {
    async complete({ system, messages, tools }): Promise<LlmResponse> {
      const res = await withRetry(
        () =>
          withTimeout(opts.timeoutMs, async (signal) => {
            try {
              return await client.messages.create(
                { model: opts.model, max_tokens: 1024, system, messages, tools },
                { signal },
              );
            } catch (err) {
              if (err instanceof Anthropic.APIError && typeof err.status === "number") {
                throw new HttpError(err.status, err.message);
              }
              throw err;
            }
          }),
        { retries: 2, shouldRetry: isRetryableHttpError },
      );

      const content: ContentBlock[] = [];
      for (const block of res.content) {
        if (block.type === "text") content.push({ type: "text", text: block.text });
        else if (block.type === "tool_use") content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
      }
      const stopReason =
        res.stop_reason === "end_turn" || res.stop_reason === "tool_use" || res.stop_reason === "max_tokens"
          ? res.stop_reason
          : "other";
      return { stopReason, content };
    },
  };
}
