import { describe, expect, it } from "vitest";
import { classifyError } from "./errors.js";

describe("classifyError", () => {
  it("classifies rate limits as transient", () => {
    expect(classifyError(new Error("429 Too Many Requests"))).toBe("transient");
  });

  it("classifies TypeScript failures as recoverable", () => {
    expect(classifyError(new Error("tsc exited with code 2"))).toBe("recoverable");
  });

  it("classifies invalid image as fatal", () => {
    expect(classifyError(new Error("invalid image: unsupported media type"))).toBe("fatal");
  });
});
