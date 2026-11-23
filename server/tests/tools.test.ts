import { describe, expect, it } from "vitest";
import { executeTool, StaticRates } from "../src/ai/tools.js";
import { InMemoryLedger } from "../src/store/ledger.js";

const ctx = { userId: "user-123", ledger: new InMemoryLedger(() => new Date("2026-11-20T12:00:00Z")), rates: new StaticRates() };

describe("executeTool", () => {
  it("counts only successful transactions in the balance", async () => {
    // Credits 250,000 + 15,000; successful debits 10,000 + 35,000. Pending and failed are excluded.
    const res = await executeTool("get_balance", {}, ctx);
    expect(res.isError).toBe(false);
    expect(JSON.parse(res.content)).toEqual({ balance: "₦220,000.00", currency: "NGN" });
  });

  it("filters and limits transactions, newest first", async () => {
    const res = await executeTool("list_transactions", { type: "debit", limit: 2 }, ctx);
    const rows = JSON.parse(res.content);
    expect(rows).toHaveLength(2);
    expect(rows.every((r: { type: string }) => r.type === "debit")).toBe(true);
    expect(rows[0].date >= rows[1].date).toBe(true);
  });

  it("rejects out-of-range input from the model instead of running it", async () => {
    const res = await executeTool("list_transactions", { limit: 500 }, ctx);
    expect(res.isError).toBe(true);
    expect(res.content).toMatch(/limit/);
  });

  it("rejects extra fields, such as a model trying to choose the user", async () => {
    const res = await executeTool("get_balance", { userId: "someone-else" }, ctx);
    expect(res.isError).toBe(true);
  });

  it("converts currencies with an indicative rate", async () => {
    const res = await executeTool("convert_currency", { amount: 155000, from: "NGN", to: "USD" }, ctx);
    expect(JSON.parse(res.content)).toMatchObject({ converted: 100, indicative: true });
  });

  it("reports unknown tools as errors", async () => {
    const res = await executeTool("send_money", { amount: 1 }, ctx);
    expect(res).toEqual({ content: "Unknown tool: send_money", isError: true });
  });
});
