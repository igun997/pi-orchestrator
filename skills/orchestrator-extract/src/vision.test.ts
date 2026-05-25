import { describe, expect, it } from "vitest";
import { MockVisionClient } from "./vision.js";

describe("MockVisionClient", () => {
  it("returns design system with OKLCH colors", async () => {
    const client = new MockVisionClient();
    const ds = await client.extractDesignSystem("ds.png");
    expect(ds.colors.primary).toContain("oklch");
    expect(ds.typography.fontFamilies.display).toBe("Inter");
    expect(ds.components[0]?.name).toBe("Button");
  });

  it("returns page spec with hero section", async () => {
    const client = new MockVisionClient();
    const page = await client.extractPageSpec("page.png");
    expect(page.meta.inferredPageType).toBe("landing");
    expect(page.sections[0]?.id).toBe("hero");
    expect(page.sections[0]?.content).toHaveProperty("headline");
  });
});
