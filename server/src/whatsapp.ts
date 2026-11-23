import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpError, isRetryableHttpError, withRetry, withTimeout } from "./lib/retry.js";

/** Checks Meta's X-Hub-Signature-256 header against the raw request body. */
export function isValidSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "hex");
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const WebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

export interface InboundMessage {
  id: string;
  from: string;
  text: string | null; // null for images, voice notes, etc.
}

/** Extracts inbound messages; delivery/read status callbacks produce an empty list. */
export function parseInbound(body: unknown): InboundMessage[] {
  const parsed = WebhookSchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.entry.flatMap((e) =>
    e.changes.flatMap((c) =>
      (c.value.messages ?? []).map((m) => ({ id: m.id, from: m.from, text: m.type === "text" ? (m.text?.body ?? null) : null })),
    ),
  );
}

/** Meta retries webhooks, so the same message id can arrive more than once. */
export class SeenMessages {
  private readonly seen = new Map<string, number>();
  constructor(
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns true the first time an id is seen within the TTL. */
  markIfNew(id: string): boolean {
    const t = this.now();
    for (const [k, at] of this.seen) if (t - at > this.ttlMs) this.seen.delete(k);
    if (this.seen.has(id)) return false;
    this.seen.set(id, t);
    return true;
  }
}

export type SendText = (to: string, body: string) => Promise<void>;

export function createWhatsAppSender(opts: { accessToken: string; phoneNumberId: string; graphVersion: string }): SendText {
  const url = `https://graph.facebook.com/${opts.graphVersion}/${opts.phoneNumberId}/messages`;
  return (to, body) =>
    withRetry(
      () =>
        withTimeout(10_000, async (signal) => {
          const res = await fetch(url, {
            method: "POST",
            signal,
            headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4096) } }),
          });
          if (!res.ok) throw new HttpError(res.status, `WhatsApp send failed: ${res.status} ${await res.text()}`);
        }),
      { retries: 3, shouldRetry: isRetryableHttpError },
    );
}
