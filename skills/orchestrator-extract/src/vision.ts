import type { DesignSystem, PageSpec } from "@orchestrator/shared";

export interface VisionClient {
  extractDesignSystem(imagePath: string): Promise<DesignSystem>;
  extractPageSpec(imagePath: string): Promise<PageSpec>;
}

export class MockVisionClient implements VisionClient {
  async extractDesignSystem(_imagePath: string): Promise<DesignSystem> {
    return {
      colors: {
        primary: "oklch(0.62 0.14 240)",
        secondary: "oklch(0.72 0.08 210)",
        accent: "oklch(0.68 0.18 35)",
        neutrals: ["oklch(0.98 0.01 240)", "oklch(0.2 0.01 240)"],
        semantic: {
          success: "oklch(0.68 0.12 145)",
          warn: "oklch(0.72 0.14 75)",
          error: "oklch(0.62 0.18 25)",
          info: "oklch(0.65 0.12 230)"
        }
      },
      typography: {
        fontFamilies: { display: "Inter", body: "Inter", mono: "JetBrains Mono" },
        scale: ["1rem", "1.25rem", "1.5rem", "2rem"],
        weights: [400, 600, 700]
      },
      spacing: { unit: "4px", scale: ["4px", "8px", "16px", "24px", "32px"] },
      radii: ["8px", "12px"],
      shadows: ["0 8px 24px oklch(0.2 0.01 240 / 0.12)"],
      borders: ["1px solid oklch(0.85 0.01 240)"],
      components: [
        { name: "Button", variants: ["primary", "secondary", "ghost"], states: ["hover", "disabled", "focus"] },
        { name: "Card", variants: ["default", "elevated"], states: ["hover"] }
      ]
    };
  }

  async extractPageSpec(_imagePath: string): Promise<PageSpec> {
    return {
      meta: { inferredPageType: "landing" },
      layout: { grid: "12-column", breakpoints: ["640px", "1024px", "1280px"], container: "max-w-7xl" },
      sections: [
        { id: "hero", kind: "hero", order: 0, content: { headline: "Build faster", subheadline: "Ship with confidence" }, components: ["Button"], notes: ["large visual, centered"] },
        { id: "features", kind: "features", order: 1, content: { items: 3 }, components: ["Card"], notes: ["grid layout"] },
        { id: "cta", kind: "cta", order: 2, content: { headline: "Get started today" }, components: ["Button"], notes: [] }
      ]
    };
  }
}
