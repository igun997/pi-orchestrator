import { describe, expect, it } from "vitest";
import { generateQuestions } from "./questions.js";
import type { PageSpec } from "@orchestrator/shared";

describe("generateQuestions", () => {
  const singleSectionSpec: PageSpec = {
    meta: { inferredPageType: "landing" },
    layout: { grid: "12-column", breakpoints: [], container: "max-w-7xl" },
    sections: [{ id: "hero", kind: "hero", order: 0, content: {}, components: [], notes: [] }]
  };

  const multiSectionSpec: PageSpec = {
    meta: { inferredPageType: "landing" },
    layout: { grid: "12-column", breakpoints: [], container: "max-w-7xl" },
    sections: [
      { id: "hero", kind: "hero", order: 0, content: {}, components: [], notes: [] },
      { id: "features", kind: "features", order: 1, content: {}, components: [], notes: [] }
    ]
  };

  it("always includes core questions", () => {
    const questions = generateQuestions(singleSectionSpec);
    const ids = questions.map((q) => q.id);
    expect(ids).toContain("product-name");
    expect(ids).toContain("backend-level");
    expect(ids).toContain("register");
  });

  it("caps at eight questions", () => {
    const questions = generateQuestions(singleSectionSpec);
    expect(questions.length).toBeLessThanOrEqual(8);
  });

  it("asks about extra pages when only one section", () => {
    const questions = generateQuestions(singleSectionSpec);
    expect(questions.map((q) => q.id)).toContain("extra-pages");
  });

  it("skips extra-pages when multiple sections", () => {
    const questions = generateQuestions(multiSectionSpec);
    expect(questions.map((q) => q.id)).not.toContain("extra-pages");
  });
});
