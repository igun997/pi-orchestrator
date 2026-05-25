import { describe, expect, it } from "vitest";
import type { RunState, Task } from "@orchestrator/shared";
import { runReadyTasks } from "./runner.js";

function stateWithTasks(tasks: Task[]): RunState {
  return {
    runId: "r1",
    createdAt: "now",
    phase: "building",
    inputs: {},
    specs: {},
    answers: {},
    confirmed: true,
    tasks,
    stack: {},
    config: { autoHeal: false, maxParallelImpeccable: 3 },
    deployment: {}
  };
}

describe("runReadyTasks", () => {
  it("runs ready tasks and marks them complete", async () => {
    const state = stateWithTasks([
      { id: "shape", name: "Shape", status: "pending", deps: [] },
      { id: "craft", name: "Craft", status: "pending", deps: ["shape"] },
      { id: "done", name: "Done", status: "complete", deps: [] }
    ]);
    const executed: string[] = [];

    const next = await runReadyTasks(state, async (task) => {
      executed.push(task.id);
    });

    expect(executed).toEqual(["shape"]);
    expect(next.tasks.find((task) => task.id === "shape")?.status).toBe("complete");
    expect(next.tasks.find((task) => task.id === "craft")?.status).toBe("pending");
  });

  it("marks failed ready task with errorRef", async () => {
    const state = stateWithTasks([
      { id: "shape", name: "Shape", status: "pending", deps: [] }
    ]);

    const next = await runReadyTasks(state, async () => {
      throw new Error("boom");
    });

    const task = next.tasks.find((candidate) => candidate.id === "shape");
    expect(task?.status).toBe("failed");
    expect(task?.errorRef).toBe("boom");
  });
});
