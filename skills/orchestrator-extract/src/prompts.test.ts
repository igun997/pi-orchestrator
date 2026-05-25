import { describe, expect, it } from "vitest";

import { designSystemPrompt, pageSpecPrompt } from "./prompts.js";

describe("orchestrator extract prompts", () => {
  it("designSystemPrompt asks for OKLCH colors", () => {
    const prompt = designSystemPrompt();

    expect(prompt).toContain("OKLCH");
    expect(prompt).toContain("colors");
  });

  it("pageSpecPrompt asks for sections in order", () => {
    const prompt = pageSpecPrompt();

    expect(prompt).toContain("sections");
    expect(prompt).toContain("order");
  });
});
