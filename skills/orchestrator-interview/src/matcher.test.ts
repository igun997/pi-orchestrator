import { describe, it, expect } from "vitest";
import { matchPresets, formatPresetOptions, resolveChoice } from "./matcher.js";
import { PRESETS } from "@orchestrator/shared";

describe("matchPresets", () => {
  it("returns food-related presets for food delivery + bold tone", () => {
    const results = matchPresets({ tone: "4", purpose: "Food delivery landing page" });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("street-food-energy");
  });

  it("returns tech presets for SaaS + professional tone", () => {
    const results = matchPresets({ tone: "1", purpose: "SaaS dashboard for project management" });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("corporate-trust");
  });

  it("returns minimal presets for portfolio + minimal tone", () => {
    const results = matchPresets({ tone: "3", purpose: "Portfolio site for photographer" });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("zen-minimal");
  });

  it("limits results to specified count", () => {
    const results = matchPresets({ tone: "4", purpose: "Food delivery" }, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array when no match", () => {
    const results = matchPresets({ tone: "xyz", purpose: "zzz" });
    expect(results).toEqual([]);
  });
});

describe("formatPresetOptions", () => {
  it("formats presets with labels A, B, C", () => {
    const presets = PRESETS.slice(0, 2);
    const output = formatPresetOptions(presets);
    expect(output).toContain("A)");
    expect(output).toContain("B)");
    expect(output).toContain(presets[0]!.emoji);
    expect(output).toContain(presets[1]!.name);
  });
});

describe("resolveChoice", () => {
  const presets = PRESETS.slice(0, 3);

  it("resolves by letter", () => {
    expect(resolveChoice("A", presets)).toBe(presets[0]);
    expect(resolveChoice("b", presets)).toBe(presets[1]);
    expect(resolveChoice("C", presets)).toBe(presets[2]);
  });

  it("resolves by number", () => {
    expect(resolveChoice("1", presets)).toBe(presets[0]);
    expect(resolveChoice("2", presets)).toBe(presets[1]);
  });

  it("resolves by name substring", () => {
    expect(resolveChoice("street food", presets)).toBe(presets[0]);
  });

  it("returns undefined for no match", () => {
    expect(resolveChoice("zzz", presets)).toBeUndefined();
  });
});
