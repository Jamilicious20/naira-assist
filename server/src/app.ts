import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { runAgent } from "./ai/agent.js";
import type { RatesProvider } from "./ai/tools.js";
import type { LlmClient } from "./ai/types.js";
import { requireAuth, type AuthedRequest, type TokenVerifier } from "./auth.js";
import type { ConversationStore } from "./store/conversations.js";
import { formatNaira, type LedgerRepository } from "./store/ledger.js";
import { isValidSignature, parseInbound, SeenMessages, type SendText } from "./whatsapp.js";

export interface AppDeps {
  llm: LlmClient;
  ledger: LedgerRepository;
  rates: RatesProvider;
  conversations: ConversationStore;
  verifyToken: TokenVerifier;
  whatsapp?: {
    verifyToken: string;
    appSecret: string;
    send: SendText;
    /** Normalised phone number -> app userId. */
    linkedNumbers: Map<string, string>;
  };
  /** Lets tests wait for background WhatsApp processing. */
  onBackgroundTask?: (p: Promise<void>) => void;
}

type RawBodyRequest = Request & { rawBody?: Buffer };

const ChatBody = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
});

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  // Keep the raw bytes: the WhatsApp signature is computed over them, not over re-serialised JSON.
  app.use(express.json({ limit: "256kb", verify: (req, _res, buf) => void ((req as RawBodyRequest).rawBody = buf) }));

  // Serialise turns per conversation so two quick messages can't interleave and corrupt history.
  const locks = new Map<string, Promise<unknown>>();
  const withConversationLock = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    locks.set(key, next);
    void next.finally(() => locks.get(key) === next && locks.delete(key)).catch(() => undefined);
    return next;
  };

  const chatTurn = (userId: string, conversationKey: string, text: string) =>
    withConversationLock(conversationKey, async () => {
      const history = await deps.conversations.load(conversationKey);
      const result = await runAgent({ llm: deps.llm, history, userText: text, ctx: { userId, ledger: deps.ledger, rates: deps.rates } });
      await deps.conversations.save(conversationKey, result.messages);
      return result;
    });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const auth = requireAuth(deps.verifyToken);

  app.get("/api/wallet", auth, async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const [wallet, transactions] = await Promise.all([deps.ledger.getWallet(userId), deps.ledger.listTransactions(userId, { limit: 20 })]);
    res.json({
      balanceKobo: wallet.balanceKobo,
      balanceFormatted: formatNaira(wallet.balanceKobo),
      currency: wallet.currency,
      transactions,
    });
  });

  app.post("/api/chat", auth, async (req: AuthedRequest, res) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.issues.map((i) => i.message) });
      return;
    }
    const conversationId = parsed.data.conversationId ?? randomUUID();
    // Conversation keys are namespaced by user, so one user can't read another's thread by guessing an id.
    const result = await chatTurn(req.userId!, `app:${req.userId}:${conversationId}`, parsed.data.message);
    res.json({ conversationId, reply: result.reply, toolsUsed: result.toolCalls.map((t) => t.name) });
  });

  // ---- WhatsApp Cloud API webhook ----
  const wa = deps.whatsapp;
  if (wa) {
    const seen = new SeenMessages();

    // Meta calls this once when you register the webhook URL.
    app.get("/webhooks/whatsapp", (req, res) => {
      const ok = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === wa.verifyToken;
      if (ok) res.status(200).send(String(req.query["hub.challenge"] ?? ""));
      else res.sendStatus(403);
    });

    app.post("/webhooks/whatsapp", (req: RawBodyRequest, res) => {
      if (!req.rawBody || !isValidSignature(req.rawBody, req.header("x-hub-signature-256"), wa.appSecret)) {
        res.sendStatus(401);
        return;
      }
      // Acknowledge immediately; Meta retries if we take too long, so the LLM work happens after.
      res.sendStatus(200);

      for (const msg of parseInbound(req.body)) {
        if (!seen.markIfNew(msg.id)) continue;
        const task = (async () => {
          const userId = wa.linkedNumbers.get(msg.from.replace(/\D/g, ""));
          if (!userId) {
            await wa.send(msg.from, "This number isn't linked to a Naira Assist account yet. Open the app and go to Settings > WhatsApp to link it.");
            return;
          }
          if (msg.text === null) {
            await wa.send(msg.from, "I can only read text messages for now. Please type your question.");
            return;
          }
          try {
            const result = await chatTurn(userId, `wa:${msg.from}`, msg.text);
            await wa.send(msg.from, result.reply);
          } catch (err) {
            console.error("[whatsapp] turn failed", err);
            await wa.send(msg.from, "Sorry, something went wrong on our side. Please try again in a minute.");
          }
        })().catch((err) => console.error("[whatsapp] send failed", err));
        deps.onBackgroundTask?.(task);
      }
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Express 5 forwards rejected async handlers here.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[http]", err);
    if (!res.headersSent) res.status(502).json({ error: "upstream_unavailable", message: "The assistant is unavailable right now. Please try again." });
  });

  return app;
}
