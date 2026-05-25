import { describe, expect, it } from "vitest";
import { retryClassified } from "./retry.js";
import { classifyError } from "./errors.js";

describe("retryClassified", () => {
  it("retries transient errors up to max", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error("429 Too Many Requests");
      return "ok";
    };
    const result = await retryClassified(fn, { retries: 3, delayMs: 0, classify: classifyError });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry fatal errors", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error("invalid image: unsupported media type");
    };
    await expect(retryClassified(fn, { retries: 3, delayMs: 0, classify: classifyError })).rejects.toThrow("invalid image");
    expect(attempts).toBe(1);
  });

  it("throws after max retries exhausted", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error("500 Internal Server Error");
    };
    await expect(retryClassified(fn, { retries: 2, delayMs: 0, classify: classifyError })).rejects.toThrow("500");
    expect(attempts).toBe(2);
  });
});
