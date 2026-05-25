import { describe, expect, it } from "vitest";
import { craftHash } from "./hash.js";

describe("craftHash", () => {
  it("returns same hash for same inputs", () => {
    const h1 = craftHash('{"id":"hero"}', '{"tone":"bold"}', "abc123");
    const h2 = craftHash('{"id":"hero"}', '{"tone":"bold"}', "abc123");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("returns different hash for different inputs", () => {
    const h1 = craftHash('{"id":"hero"}', '{"tone":"bold"}', "abc123");
    const h2 = craftHash('{"id":"hero"}', '{"tone":"calm"}', "abc123");
    expect(h1).not.toBe(h2);
  });
});
