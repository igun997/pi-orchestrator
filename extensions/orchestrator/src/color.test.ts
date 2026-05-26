import { describe, expect, it } from "vitest";
import { hexToOklch, hexBatchToOklch } from "./color.js";

describe("color", () => {
  it("converts white", () => {
    const result = hexToOklch("#FFFFFF");
    expect(result).toMatch(/^oklch\(100\.00% 0\.0000/);
  });

  it("converts black", () => {
    const result = hexToOklch("#000000");
    expect(result).toMatch(/^oklch\(0\.00% 0\.0000/);
  });

  it("converts a saturated color", () => {
    const result = hexToOklch("#FF0000");
    expect(result).toContain("oklch(");
    expect(result).toContain("%");
  });

  it("handles 3-char hex", () => {
    const result = hexToOklch("#F00");
    expect(result).toContain("oklch(");
  });

  it("handles no hash", () => {
    const result = hexToOklch("1E63D6");
    expect(result).toContain("oklch(");
  });

  it("batch converts", () => {
    const result = hexBatchToOklch({ primary: "#FF7A59", secondary: "#1E63D6" });
    expect(result["primary"]!.oklch).toContain("oklch(");
    expect(result["secondary"]!.oklch).toContain("oklch(");
    expect(result["primary"]!.hex).toBe("#FF7A59");
  });
});
