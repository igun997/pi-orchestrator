import { describe, expect, it } from "vitest";
import { planScaffoldTasks } from "./plan.js";

describe("planScaffoldTasks", () => {
  it("does not include a Supabase task when backend is none", () => {
    const tasks = planScaffoldTasks("none");

    expect(tasks.map((task) => task.id)).not.toContain("supabase-provision");
  });

  it("includes a Supabase provision task for contact-form backend", () => {
    const tasks = planScaffoldTasks("contact-form");

    expect(tasks.map((task) => task.id)).toContain("supabase-provision");
  });

  it("makes shadcn init depend on Astro init", () => {
    const tasks = planScaffoldTasks("none");
    const shadcnInit = tasks.find((task) => task.id === "shadcn-init");

    expect(shadcnInit?.deps).toContain("astro-init");
  });
});
