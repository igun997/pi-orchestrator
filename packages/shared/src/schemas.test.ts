import { describe, expect, it } from "vitest";
import { DesignSystemSchema, PageSpecSchema, RunStateSchema } from "./schemas.js";

describe("schemas", () => {
  it("validates design system tokens", () => {
    const parsed = DesignSystemSchema.parse({
      colors: {
        primary: "oklch(0.62 0.14 240)",
        secondary: "oklch(0.72 0.08 210)",
        accent: "oklch(0.68 0.18 35)",
        neutrals: ["oklch(0.98 0.01 240)", "oklch(0.2 0.01 240)"],
        semantic: { success: "oklch(0.68 0.12 145)", warn: "oklch(0.72 0.14 75)", error: "oklch(0.62 0.18 25)", info: "oklch(0.65 0.12 230)" }
      },
      typography: { fontFamilies: { display: "Inter", body: "Inter", mono: "JetBrains Mono" }, scale: ["1rem", "1.25rem"], weights: [400, 600, 700] },
      spacing: { unit: "4px", scale: ["4px", "8px", "16px"] },
      radii: ["8px"],
      shadows: ["0 8px 24px oklch(0.2 0.01 240 / 0.12)"],
      borders: ["1px solid oklch(0.85 0.01 240)"],
      components: [{ name: "Button", variants: ["primary"], states: ["hover", "disabled"] }]
    });
    expect(parsed.colors.primary).toContain("oklch");
  });

  it("validates page sections", () => {
    const parsed = PageSpecSchema.parse({
      meta: { inferredPageType: "landing" },
      layout: { grid: "12-column", breakpoints: ["640px", "1024px"], container: "max-w-7xl" },
      sections: [{ id: "hero", kind: "hero", order: 0, content: { headline: "Build faster" }, components: ["Button"], notes: ["large visual"] }]
    });
    expect(parsed.sections[0]?.id).toBe("hero");
  });

  it("rejects invalid run phase", () => {
    expect(() => RunStateSchema.parse({ runId: "r", phase: "wat", createdAt: new Date().toISOString(), inputs: {}, tasks: [] })).toThrow();
  });
});
