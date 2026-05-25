import { describe, expect, it } from "vitest";
import { assemblePage } from "./assemble.js";

describe("assemblePage", () => {
  it("generates astro page with imports and components in order", () => {
    const page = assemblePage([{ id: "hero" }, { id: "pricing" }]);
    expect(page).toContain('import Hero from "../components/hero.astro"');
    expect(page).toContain('import Pricing from "../components/pricing.astro"');
    expect(page).toContain("<Hero />");
    expect(page).toContain("<Pricing />");
    expect(page.indexOf("<Hero />")).toBeLessThan(page.indexOf("<Pricing />"));
  });

  it("handles kebab-case ids", () => {
    const page = assemblePage([{ id: "call-to-action" }]);
    expect(page).toContain("import CallToAction");
    expect(page).toContain("<CallToAction />");
  });
});
