import { describe, expect, it } from "vitest";
import { renderConfirmSummary } from "./summary.js";

describe("renderConfirmSummary", () => {
  it("includes backend and task count", () => {
    const text = renderConfirmSummary({
      answers: { "product-name": "Acme", "backend-level": "contact-form" },
      sectionCount: 3,
      taskCount: 12
    });
    expect(text).toContain("contact-form");
    expect(text).toContain("3 sections");
    expect(text).toContain("12 tasks");
  });

  it("shows product name", () => {
    const text = renderConfirmSummary({
      answers: { "product-name": "Bolt" },
      sectionCount: 1,
      taskCount: 5
    });
    expect(text).toContain("Bolt");
  });

  it("handles missing answers gracefully", () => {
    const text = renderConfirmSummary({ answers: {}, sectionCount: 2, taskCount: 8 });
    expect(text).toContain("(unset)");
    expect(text).toContain("none");
  });
});
