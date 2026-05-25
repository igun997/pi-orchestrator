import { describe, expect, it } from "vitest";
import { planBuildTasks } from "./plan.js";

describe("planBuildTasks", () => {
  const sections = [
    { id: "hero", kind: "hero" },
    { id: "pricing", kind: "pricing" }
  ];

  it("includes shape task with no deps", () => {
    const tasks = planBuildTasks(sections);
    const shape = tasks.find((t) => t.id === "impeccable-shape");
    expect(shape).toBeDefined();
    expect(shape!.deps).toEqual([]);
  });

  it("creates craft task per section depending on shape", () => {
    const tasks = planBuildTasks(sections);
    const craftHero = tasks.find((t) => t.id === "craft-hero");
    const craftPricing = tasks.find((t) => t.id === "craft-pricing");
    expect(craftHero!.deps).toEqual(["impeccable-shape"]);
    expect(craftPricing!.deps).toEqual(["impeccable-shape"]);
  });

  it("assemble depends on all craft tasks", () => {
    const tasks = planBuildTasks(sections);
    const assemble = tasks.find((t) => t.id === "assemble-page");
    expect(assemble!.deps).toContain("craft-hero");
    expect(assemble!.deps).toContain("craft-pricing");
  });

  it("polish depends on assemble, audit depends on polish", () => {
    const tasks = planBuildTasks(sections);
    expect(tasks.find((t) => t.id === "polish")!.deps).toEqual(["assemble-page"]);
    expect(tasks.find((t) => t.id === "audit")!.deps).toEqual(["polish"]);
  });
});
