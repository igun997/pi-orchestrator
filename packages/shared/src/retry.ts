import type { ErrorClass } from "./errors.js";

export interface RetryOptions {
  retries: number;
  delayMs: number;
  classify: (error: unknown) => ErrorClass;
}

export async function retryClassified<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const cls = opts.classify(err);
      if (cls !== "transient") throw err;
      if (attempt < opts.retries - 1 && opts.delayMs > 0) {
        await new Promise((r) => setTimeout(r, opts.delayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}
