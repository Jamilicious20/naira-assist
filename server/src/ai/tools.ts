import { z } from "zod";
import { formatNaira, type LedgerRepository } from "../store/ledger.js";
import type { ToolSpec } from "./types.js";

/**
 * Everything a tool needs, resolved from the authenticated request, never from the model.
 * The model can't pick whose wallet it reads: userId comes from the verified token or linked phone.
 */
export interface ToolContext {
  userId: string;
  ledger: LedgerRepository;
  rates: RatesProvider;
}

export interface RatesProvider {
  /** Units of `to` per 1 unit of `from`. */
  getRate(from: string, to: string): Promise<number>;
}

/** Indicative demo rates. A real deployment would call the FX provider used by the backend. */
export class StaticRates implements RatesProvider {
  private readonly perNaira: Record<string, number> = { NGN: 1, USD: 1 / 1550, GBP: 1 / 1960, EUR: 1 / 1680, GHS: 1 / 102, KES: 1 / 12 };
  async getRate(from: string, to: string): Promise<number> {
    const f = this.perNaira[from];
    const t = this.perNaira[to];
    if (f === undefined || t === undefined) throw new ToolInputError(`Unsupported currency pair ${from}/${to}`);
    return t / f;
  }
}

export class ToolInputError extends Error {}

interface ToolDefinition<S extends z.ZodType> {
  spec: ToolSpec;
  schema: S;
  run(input: z.infer<S>, ctx: ToolContext): Promise<unknown>;
}

const define = <S extends z.ZodType>(def: ToolDefinition<S>) => def;

const Currency = z.enum(["NGN", "USD", "GBP", "EUR", "GHS", "KES"]);

export const tools = [
  define({
    spec: {
      name: "get_balance",
      description: "Get the signed-in user's current wallet balance in Naira. Use for any question about how much money they have.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    schema: z.object({}).strict(),
    async run(_input, ctx) {
      const w = await ctx.ledger.getWallet(ctx.userId);
      return { balance: formatNaira(w.balanceKobo), currency: w.currency };
    },
  }),
  define({
    spec: {
      name: "list_transactions",
      description:
        "List the user's most recent wallet transactions, newest first. Each has a status: successful, pending or failed. Optionally filter by credit or debit.",
      input_schema: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 20, description: "How many to return (default 5)" },
          type: { type: "string", enum: ["credit", "debit"] },
        },
        additionalProperties: false,
      },
    },
    schema: z.object({ limit: z.number().int().min(1).max(20).default(5), type: z.enum(["credit", "debit"]).optional() }).strict(),
    async run(input, ctx) {
      const txns = await ctx.ledger.listTransactions(ctx.userId, input);
      return txns.map((t) => ({
        date: t.createdAt.slice(0, 10),
        type: t.type,
        amount: formatNaira(t.amountKobo),
        description: t.description,
        status: t.status,
      }));
    },
  }),
  define({
    spec: {
      name: "convert_currency",
      description: "Convert an amount between NGN, USD, GBP, EUR, GHS and KES using today's indicative rate. This is a quote only; it does not move money.",
      input_schema: {
        type: "object",
        properties: {
          amount: { type: "number", exclusiveMinimum: 0 },
          from: { type: "string", enum: Currency.options },
          to: { type: "string", enum: Currency.options },
        },
        required: ["amount", "from", "to"],
        additionalProperties: false,
      },
    },
    schema: z.object({ amount: z.number().positive().max(1e12), from: Currency, to: Currency }).strict(),
    async run({ amount, from, to }, ctx) {
      const rate = await ctx.rates.getRate(from, to);
      return { from, to, amount, rate: Number(rate.toPrecision(6)), converted: Math.round(amount * rate * 100) / 100, indicative: true };
    },
  }),
] as const;

export const toolSpecs: ToolSpec[] = tools.map((t) => t.spec);

/** Validates model-supplied input and runs the tool. Errors go back to the model as tool errors, not crashes. */
export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<{ content: string; isError: boolean }> {
  const tool = tools.find((t) => t.spec.name === name);
  if (!tool) return { content: `Unknown tool: ${name}`, isError: true };
  const parsed = tool.schema.safeParse(input ?? {});
  if (!parsed.success) {
    return { content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`, isError: true };
  }
  try {
    // The union of tool types needs a cast here; each tool's run() is typed by its own schema.
    const result = await (tool.run as (i: unknown, c: ToolContext) => Promise<unknown>)(parsed.data, ctx);
    return { content: JSON.stringify(result), isError: false };
  } catch (err) {
    if (err instanceof ToolInputError) return { content: err.message, isError: true };
    console.error(`[tool:${name}]`, err);
    return { content: "The service is temporarily unavailable.", isError: true };
  }
}
