import { describe, expect, it } from "vitest";
import { buildCommands } from "./commands.js";

describe("buildCommands", () => {
  const sections = [
    { id: "hero", kind: "hero" },
    { id: "pricing", kind: "pricing" }
  ];

  it("generates shape command", () => {
    const cmds = buildCommands(sections);
    expect(cmds["impeccable-shape"]).toContain("npx impeccable shape");
  });

  it("generates craft commands per section", () => {
    const cmds = buildCommands(sections);
    expect(cmds["craft-hero"]).toContain(`npx impeccable craft "hero: hero"`);
    expect(cmds["craft-pricing"]).toContain(`npx impeccable craft "pricing: pricing"`);
  });

  it("generates polish and audit commands", () => {
    const cmds = buildCommands(sections);
    expect(cmds["polish"]).toContain("npx impeccable polish src/pages/index.astro");
    expect(cmds["audit"]).toContain("npx impeccable audit src/pages/index.astro");
  });
});
