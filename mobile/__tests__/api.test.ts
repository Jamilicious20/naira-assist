import { ApiError, createApi, userMessage } from "@/lib/api";

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function setup(responses: Array<Response | Error>, opts: { refreshed?: string | null } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const onUnauthorized = jest.fn();
  const api = createApi({
    baseUrl: "https://api.test",
    getToken: async () => "old-token",
    refreshToken: async () => (opts.refreshed === undefined ? "new-token" : opts.refreshed),
    onUnauthorized,
    fetchImpl,
    sleep: async () => {},
  });
  const authHeader = (i: number) => (calls[i]!.init.headers as Record<string, string>).Authorization;
  return { api, calls, onUnauthorized, authHeader };
}

describe("api client", () => {
  it("sends the bearer token", async () => {
    const { api, calls, authHeader } = setup([json(200, { transactions: [] })]);
    await api.getWallet();
    expect(calls[0]!.url).toBe("https://api.test/api/wallet");
    expect(authHeader(0)).toBe("Bearer old-token");
  });

  it("refreshes the token once on 401 and retries", async () => {
    const { api, authHeader, onUnauthorized } = setup([json(401, {}), json(200, { reply: "hi" })]);
    await expect(api.sendChat("hello")).resolves.toEqual({ reply: "hi" });
    expect(authHeader(1)).toBe("Bearer new-token");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("signs out when the refresh fails", async () => {
    const { api, onUnauthorized } = setup([json(401, {})], { refreshed: null });
    await expect(api.getWallet()).rejects.toMatchObject({ kind: "unauthorized" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("retries GETs on server errors", async () => {
    const { api, calls } = setup([json(503, {}), json(502, {}), json(200, { ok: true })]);
    await expect(api.getWallet()).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(3);
  });

  it("never retries POSTs, so a chat message can't be sent twice", async () => {
    const { api, calls } = setup([json(503, {})]);
    await expect(api.sendChat("hello")).rejects.toMatchObject({ kind: "server" });
    expect(calls).toHaveLength(1);
  });

  it("maps network failures to an offline error with a friendly message", async () => {
    const { api } = setup([new TypeError("Network request failed")]);
    const err = await api.sendChat("hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(userMessage(err)).toMatch(/offline/);
  });

  it("surfaces validation messages from the server", async () => {
    const { api } = setup([json(400, { details: ["Message is too long"] })]);
    const err = await api.sendChat("x").catch((e: unknown) => e);
    expect(userMessage(err)).toBe("Message is too long");
  });
});
