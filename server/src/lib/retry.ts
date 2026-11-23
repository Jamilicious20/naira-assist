export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** Runs `fn` with an AbortSignal that fires after `ms`. */
export async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError(ms)), ms);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new TimeoutError(ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false for errors that must not be retried (e.g. 4xx validation errors). */
  shouldRetry?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retries with exponential backoff and full jitter. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 300, maxDelayMs = 4_000, shouldRetry = () => true, sleep = defaultSleep } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt === retries || !shouldRetry(err)) break;
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(Math.random() * cap);
    }
  }
  throw lastError;
}

/** HTTP error carrying the status code so callers can decide whether to retry. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const isRetryableHttpError = (err: unknown): boolean =>
  err instanceof TimeoutError ||
  (err instanceof HttpError && (err.status === 429 || err.status >= 500)) ||
  (err instanceof TypeError && /fetch failed/i.test(err.message));
