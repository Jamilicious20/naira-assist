/**
 * Typed client for the Naira Assist API.
 * - Attaches the Supabase access token; on 401 refreshes once, then signs out.
 * - Every request has a timeout.
 * - Only GETs are retried automatically: retrying a POST could repeat an action.
 */

export interface Transaction {
  id: string;
  type: "credit" | "debit";
  amountKobo: number;
  description: string;
  createdAt: string;
  status: "successful" | "pending" | "failed";
}

export interface WalletResponse {
  balanceKobo: number;
  balanceFormatted: string;
  currency: "NGN";
  transactions: Transaction[];
}

export interface ChatResponse {
  conversationId: string;
  reply: string;
  toolsUsed: string[];
}

export type ApiErrorKind = "offline" | "timeout" | "unauthorized" | "bad_request" | "server";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Messages shown to users; raw errors stay in logs. */
export function userMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  switch (err.kind) {
    case "offline":
      return "You appear to be offline. Check your connection and try again.";
    case "timeout":
      return "This is taking too long. Please try again.";
    case "unauthorized":
      return "Your session has expired. Please sign in again.";
    case "bad_request":
      return err.message;
    case "server":
      return "Our service is having trouble right now. Please try again shortly.";
  }
}

export interface ApiDeps {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  refreshToken: () => Promise<string | null>;
  onUnauthorized: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createApi(deps: ApiDeps) {
  const { baseUrl, timeoutMs = 20_000, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = deps;

  async function once<T>(method: "GET" | "POST", path: string, body: unknown, token: string | null): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw controller.signal.aborted ? new ApiError("timeout", "Request timed out") : new ApiError("offline", "Network request failed");
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) return (await res.json()) as T;
    const payload = (await res.json().catch(() => ({}))) as { message?: string; details?: string[] };
    if (res.status === 401) throw new ApiError("unauthorized", "Unauthorized", 401);
    if (res.status >= 400 && res.status < 500) {
      throw new ApiError("bad_request", payload.details?.join(", ") || payload.message || "Invalid request", res.status);
    }
    throw new ApiError("server", payload.message ?? `Server error ${res.status}`, res.status);
  }

  async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const maxAttempts = method === "GET" ? 3 : 1;
    for (let attempt = 1; ; attempt++) {
      try {
        try {
          return await once<T>(method, path, body, await deps.getToken());
        } catch (err) {
          if (!(err instanceof ApiError && err.kind === "unauthorized")) throw err;
          const fresh = await deps.refreshToken();
          if (!fresh) throw err;
          return await once<T>(method, path, body, fresh);
        }
      } catch (err) {
        if (err instanceof ApiError && err.kind === "unauthorized") {
          deps.onUnauthorized();
          throw err;
        }
        const transient = err instanceof ApiError && (err.kind === "server" || err.kind === "timeout" || err.kind === "offline");
        if (!transient || attempt >= maxAttempts) throw err;
        await sleep(400 * 2 ** (attempt - 1));
      }
    }
  }

  return {
    getWallet: () => request<WalletResponse>("GET", "/api/wallet"),
    sendChat: (message: string, conversationId?: string) => request<ChatResponse>("POST", "/api/chat", { message, conversationId }),
  };
}

export type Api = ReturnType<typeof createApi>;
