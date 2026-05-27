import { describe, expect, it, beforeEach, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialState, saveState, loadState } from "@orchestrator/shared";
import { advancePipeline, runPipeline, type PipelineDriver } from "./pipeline.js";
import { assembleTaskGraph } from "./assemble-graph.js";
import type { TaskResult } from "./subagent.js";

function mockDriver(): PipelineDriver & { spawned: string[]; results: Map<string, TaskResult> } {
  const spawned: string[] = [];
  const results = new Map<string, TaskResult>();
  return {
    spawned,
    results,
    spawnTask: vi.fn(async (task) => {
      spawned.push(task.id);
      const preset = results.get(task.id);
      if (preset) return preset;
      return { taskId: task.id, status: "complete" as const, durationMs: 100 };
    }),
    notify: vi.fn(),
    onTaskStart: vi.fn(),
    onTaskEnd: vi.fn(),
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

    const sections = ["hero", "features", "pricing", "testimonials", "faq", "cta"].map(id => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "astro", backend: "none", domain: "none", sections });
    state.tasks = state.tasks.map(t =>
      ["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)
        ? { ...t, status: "complete" as const } : t
    );

    await saveState(dir, state);
    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    const craftDispatched = result.dispatched.filter(id => id.startsWith("craft-"));
    expect(craftDispatched).toHaveLength(3);
    expect(result.dispatched).toHaveLength(3);
  });

  it("dispatches non-impeccable tasks without throttle", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "astro", "product-name": "test", "backend-level": "contact-form" };

    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "astro", backend: "contact-form", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    expect(result.dispatched).toContain("astro-init");
    expect(result.dispatched).toContain("write-context");
  });

  it("respects custom maxParallelImpeccable value", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "building";
    state.answers = { framework: "astro", "product-name": "test" };
    state.config.maxParallelImpeccable = 1;

    const sections = ["hero", "features", "pricing"].map(id => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "astro", backend: "none", domain: "none", sections });
    state.tasks = state.tasks.map(t =>
      ["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)
        ? { ...t, status: "complete" as const } : t
    );

    await saveState(dir, state);
    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]).toMatch(/^craft-/);
  });

  it("fills slots when some impeccable tasks already running", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "building";
    state.answers = { framework: "astro", "product-name": "test" };

    const sections = ["hero", "features", "pricing", "cta"].map(id => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "astro", backend: "none", domain: "none", sections });
    state.tasks = state.tasks.map(t => {
      if (["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)) return { ...t, status: "complete" as const };
      if (t.id === "craft-hero") return { ...t, status: "running" as const };
      return t;
    });

    await saveState(dir, state);
    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    expect(result.dispatched).toHaveLength(2);
    expect(result.dispatched.every(id => id.startsWith("craft-"))).toBe(true);
  });

  it("marks tasks complete after spawnTask resolves", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "static", "product-name": "test" };

    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "static", backend: "none", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    await advancePipeline(dir, driver);

    // After advancePipeline completes, tasks should be marked complete in state
    const finalState = await loadState(dir);
    for (const id of driver.spawned) {
      const task = finalState.tasks.find(t => t.id === id);
      expect(task?.status).toBe("complete");
    }
  });

  it("marks task failed when spawnTask returns failed", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "static", "product-name": "test" };

    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "static", backend: "none", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    driver.results.set("static-init", { taskId: "static-init", status: "failed", error: "LLM crash", durationMs: 50 });

    await advancePipeline(dir, driver);

    const finalState = await loadState(dir);
    const staticInit = finalState.tasks.find(t => t.id === "static-init");
    expect(staticInit?.status).toBe("failed");
  });

  it("calls onTaskStart and onTaskEnd", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "static", "product-name": "test" };

    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "static", backend: "none", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    await advancePipeline(dir, driver);

    expect(driver.onTaskStart).toHaveBeenCalled();
    expect(driver.onTaskEnd).toHaveBeenCalled();
    // Each dispatched task should have both start and end
    expect((driver.onTaskStart as any).mock.calls.length).toBe((driver.onTaskEnd as any).mock.calls.length);
  });
});

describe("runPipeline", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "orch-run-"));
  });

  it("runs full pipeline to completion", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "static", "product-name": "test" };

    // Simple pipeline: static-init + write-context → shape → craft-hero → assemble → polish → audit
    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "static", backend: "none", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    await runPipeline(dir, driver);

    const finalState = await loadState(dir);
    expect(finalState.phase).toBe("done");
    expect(finalState.tasks.every(t => t.status === "complete")).toBe(true);
  });

  it("stops on failure", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "static", "product-name": "test" };

    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "static", backend: "none", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    // Fail the first task
    driver.results.set("static-init", { taskId: "static-init", status: "failed", error: "crash", durationMs: 10 });

    await runPipeline(dir, driver);

    const finalState = await loadState(dir);
    // Pipeline should stall — downstream tasks can't run
    expect(finalState.tasks.find(t => t.id === "static-init")?.status).toBe("failed");
  });
});
