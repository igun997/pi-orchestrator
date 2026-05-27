import { describe, expect, it, beforeEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialState, saveState, loadState } from "@orchestrator/shared";
import { advancePipeline, type PipelineDriver } from "./pipeline.js";
import { assembleTaskGraph } from "./assemble-graph.js";

function mockDriver(): PipelineDriver & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    sendMessage: (text: string) => messages.push(text),
    notify: () => {}
  };
}

describe("advancePipeline", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "orch-pipeline-"));
  });

  it("throttles impeccable tasks to maxParallelImpeccable", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "building";
    state.answers = { framework: "astro", "product-name": "test" };

    // 6 sections — all craft tasks ready after shape completes
    const sections = ["hero", "features", "pricing", "testimonials", "faq", "cta"].map((id) => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({
      targetDir: dir,
      framework: "astro",
      backend: "none",
      domain: "none",
      sections
    });

    // Mark all scaffold + impeccable-shape as complete so all crafts become ready
    state.tasks = state.tasks.map((t) =>
      ["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)
        ? { ...t, status: "complete" as const }
        : t
    );

    // maxParallelImpeccable defaults to 3
    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    // Should dispatch exactly 3 craft tasks (not all 6)
    const craftDispatched = result.dispatched.filter((id) => id.startsWith("craft-"));
    expect(craftDispatched).toHaveLength(3);
    expect(result.dispatched).toHaveLength(3);
  });

  it("dispatches non-impeccable tasks without throttle", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "astro", "product-name": "test", "backend-level": "contact-form" };

    state.tasks = assembleTaskGraph({
      targetDir: dir,
      framework: "astro",
      backend: "contact-form",
      domain: "none",
      sections: [{ id: "hero", kind: "hero" }]
    });

    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    // astro-init and write-context are both ready (no deps), both non-impeccable
    expect(result.dispatched).toContain("astro-init");
    expect(result.dispatched).toContain("write-context");
  });

  it("respects custom maxParallelImpeccable value", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "building";
    state.answers = { framework: "astro", "product-name": "test" };
    state.config.maxParallelImpeccable = 1;

    const sections = ["hero", "features", "pricing"].map((id) => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({
      targetDir: dir,
      framework: "astro",
      backend: "none",
      domain: "none",
      sections
    });

    state.tasks = state.tasks.map((t) =>
      ["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)
        ? { ...t, status: "complete" as const }
        : t
    );

    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    // maxParallelImpeccable = 1: only 1 craft at a time
    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]).toMatch(/^craft-/);
  });

  it("fills slots when some impeccable tasks already running", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "building";
    state.answers = { framework: "astro", "product-name": "test" };

    const sections = ["hero", "features", "pricing", "cta"].map((id) => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({
      targetDir: dir,
      framework: "astro",
      backend: "none",
      domain: "none",
      sections
    });

    // Shape complete, hero already running, 3 others ready
    state.tasks = state.tasks.map((t) => {
      if (["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)) {
        return { ...t, status: "complete" as const };
      }
      if (t.id === "craft-hero") {
        return { ...t, status: "running" as const };
      }
      return t;
    });

    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    // 1 already running + 2 more dispatched = 3 total (maxParallelImpeccable)
    expect(result.dispatched).toHaveLength(2);
    expect(result.dispatched.every((id) => id.startsWith("craft-"))).toBe(true);
  });
});
