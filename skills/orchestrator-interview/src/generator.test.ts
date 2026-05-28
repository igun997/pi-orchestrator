import { describe, it, expect } from "vitest";
import { generateSpecs } from "./generator.js";
import { PRESETS, DesignSystemSchema, PageSpecSchema } from "@orchestrator/shared";
import type { InterviewAnswers } from "./questions.js";

describe("generateSpecs", () => {
  const preset = PRESETS[0]!; // street-food-energy

  it("generates valid design-system.json from preset", () => {
    const answers: InterviewAnswers = {
      language: "Indonesian",
      hasImages: false,
      siteName: "Warung Digital",
      brandName: "Warung Digital",
      logo: "Green leaf with chopsticks",
      purpose: "Food delivery landing page",
      tone: "4",
      presetId: preset.id,
    };

    const { designSystem } = generateSpecs(answers, preset);
    const result = DesignSystemSchema.safeParse(designSystem);
    expect(result.success).toBe(true);
  });

  it("generates valid page-spec.json for landing page", () => {
    const answers: InterviewAnswers = {
      language: "Indonesian",
      hasImages: false,
      siteName: "Warung Digital",
      purpose: "Food delivery landing page",
      tone: "4",
    };

    const { pageSpec } = generateSpecs(answers, preset);
    const result = PageSpecSchema.safeParse(pageSpec);
    expect(result.success).toBe(true);
    expect(pageSpec.meta.inferredPageType).toBe("landing");
    expect(pageSpec.sections.length).toBeGreaterThan(3);
  });

  it("generates dashboard sections for dashboard purpose", () => {
    const answers: InterviewAnswers = {
      language: "English",
      hasImages: false,
      siteName: "AdminPanel",
      purpose: "SaaS dashboard for inventory management",
      tone: "1",
    };

    const { pageSpec } = generateSpecs(answers, PRESETS[2]!); // corporate-trust
    expect(pageSpec.meta.inferredPageType).toBe("dashboard");
    const kinds = pageSpec.sections.map((s) => s.kind);
    expect(kinds).toContain("navigation");
    expect(kinds).toContain("stats");
  });

  it("uses siteName in hero section content", () => {
    const answers: InterviewAnswers = {
      language: "English",
      hasImages: false,
      siteName: "MyApp",
      purpose: "Landing page for productivity tool",
      tone: "2",
    };

    const { pageSpec } = generateSpecs(answers, preset);
    const hero = pageSpec.sections.find((s) => s.id === "hero");
    expect(hero?.content["headline"]).toBe("MyApp");
  });
});
