import { createHmac } from "node:crypto";
import { SignJWT } from "jose";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { StaticRates } from "../src/ai/tools.js";
import { createApp } from "../src/app.js";
import { createSupabaseVerifier } from "../src/auth.js";
import { InMemoryConversationStore } from "../src/store/conversations.js";
import { InMemoryLedger } from "../src/store/ledger.js";
import { ScriptedLlm, text, toolUse } from "./helpers.js";

const JWT_SECRET = "test-secret-at-least-32-characters-long";
const APP_SECRET = "whatsapp-app-secret";

const token = (sub: string, secret = JWT_SECRET) =>
  new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("authenticated")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));

const sign = (body: string) => `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

const waPayload = (id: string, from: string, body: string) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [{ id, from, type: "text", text: { body } }] } }] }],
  });

function setup(script: ConstructorParameters<typeof ScriptedLlm>[0] = []) {
  const llm = new ScriptedLlm(script);
  const sent: Array<{ to: string; body: string }> = [];
  const tasks: Promise<void>[] = [];
  const app = createApp({
    llm,
    ledger: new InMemoryLedger(),
    rates: new StaticRates(),
    conversations: new InMemoryConversationStore(),
    verifyToken: createSupabaseVerifier({ jwtSecret: JWT_SECRET }),
    whatsapp: {
      verifyToken: "verify-me-please",
      appSecret: APP_SECRET,
      linkedNumbers: new Map([["2348012345678", "user-wa"]]),
      send: async (to, body) => void sent.push({ to, body }),
    },
    onBackgroundTask: (p) => tasks.push(p),
  });
  const settle = () => Promise.all(tasks);
  return { app, llm, sent, settle };
}

describe("auth", () => {
  it("rejects requests without a token", async () => {
    const { app } = setup();
    await request(app).get("/api/wallet").expect(401, { error: "missing_token" });
  });

  it("rejects tokens signed with the wrong secret", async () => {
    const { app } = setup();
    const bad = await token("user-1", "some-other-secret-that-is-long-enough");
    await request(app).get("/api/wallet").set("Authorization", `Bearer ${bad}`).expect(401, { error: "invalid_token" });
  });
});

describe("GET /api/wallet", () => {
  it("returns the signed-in user's balance and transactions", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/wallet").set("Authorization", `Bearer ${await token("user-1")}`).expect(200);
    expect(res.body.balanceFormatted).toBe("₦220,000.00");
    expect(res.body.transactions).toHaveLength(6);
  });
});

describe("POST /api/chat", () => {
  let auth: string;
  beforeEach(async () => void (auth = `Bearer ${await token("user-1")}`));

  it("validates the request body", async () => {
    const { app } = setup();
    await request(app).post("/api/chat").set("Authorization", auth).send({ message: "   " }).expect(400);
  });

  it("runs a tool-calling turn and keeps context across turns", async () => {
    const { app, llm } = setup([toolUse({ id: "t1", name: "get_balance" }), text("You have ₦220,000.00."), text("Yes, the pending one.")]);
    const first = await request(app).post("/api/chat").set("Authorization", auth).send({ message: "Balance?" }).expect(200);
    expect(first.body).toMatchObject({ reply: "You have ₦220,000.00.", toolsUsed: ["get_balance"] });

    await request(app)
      .post("/api/chat")
      .set("Authorization", auth)
      .send({ message: "Anything pending?", conversationId: first.body.conversationId })
      .expect(200);
    expect(llm.calls.at(-1)!.length).toBe(5); // user, tool_use, tool_result, answer, new user turn
  });

  it("keeps each user's conversations separate even with the same id", async () => {
    const { app, llm } = setup([text("a"), text("b")]);
    const first = await request(app).post("/api/chat").set("Authorization", auth).send({ message: "hi" }).expect(200);
    const other = `Bearer ${await token("user-2")}`;
    await request(app).post("/api/chat").set("Authorization", other).send({ message: "hi", conversationId: first.body.conversationId });
    expect(llm.calls[1]).toHaveLength(1); // user-2 starts fresh
  });

  it("returns 502 with a friendly message when the LLM fails", async () => {
    const { app } = setup([
      () => {
        throw new Error("LLM down");
      },
    ]);
    const res = await request(app).post("/api/chat").set("Authorization", auth).send({ message: "hi" }).expect(502);
    expect(res.body.error).toBe("upstream_unavailable");
  });
});

describe("WhatsApp webhook", () => {
  it("answers Meta's verification challenge", async () => {
    const { app } = setup();
    await request(app)
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "verify-me-please", "hub.challenge": "12345" })
      .expect(200, "12345");
    await request(app).get("/webhooks/whatsapp").query({ "hub.mode": "subscribe", "hub.verify_token": "wrong" }).expect(403);
  });

  it("rejects payloads with a bad signature", async () => {
    const { app } = setup();
    const body = waPayload("m1", "2348012345678", "hi");
    await request(app).post("/webhooks/whatsapp").set("Content-Type", "application/json").set("X-Hub-Signature-256", "sha256=00").send(body).expect(401);
  });

  it("replies to a linked number and ignores Meta's duplicate deliveries", async () => {
    const { app, sent, settle, llm } = setup([text("Your balance is ₦220,000.00.")]);
    const body = waPayload("wamid.1", "2348012345678", "balance");
    for (let i = 0; i < 2; i++) {
      await request(app).post("/webhooks/whatsapp").set("Content-Type", "application/json").set("X-Hub-Signature-256", sign(body)).send(body).expect(200);
    }
    await settle();
    expect(llm.calls).toHaveLength(1);
    expect(sent).toEqual([{ to: "2348012345678", body: "Your balance is ₦220,000.00." }]);
  });

  it("tells unlinked numbers how to link instead of calling the LLM", async () => {
    const { app, sent, settle, llm } = setup();
    const body = waPayload("wamid.2", "2349099999999", "balance");
    await request(app).post("/webhooks/whatsapp").set("Content-Type", "application/json").set("X-Hub-Signature-256", sign(body)).send(body).expect(200);
    await settle();
    expect(llm.calls).toHaveLength(0);
    expect(sent[0]!.body).toMatch(/isn't linked/);
  });
});
