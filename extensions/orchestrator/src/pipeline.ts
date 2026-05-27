import { loadState, saveState, getReadyTasks, markTaskComplete, markTaskFailed, type RunState, type Task } from "@orchestrator/shared";
import type { TaskResult } from "./subagent.js";

/**
 * Simple async mutex to serialize state file writes.
 * Parallel subagents complete at different times; each completion
 * needs to read-modify-write state.json atomically.
 */
function createMutex() {
  let chain = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const next = chain.then(fn, fn);
      chain = next.then(() => {}, () => {});
      return next;
    }
  };
}

export interface PipelineDriver {
  spawnTask: (task: Task, state: RunState) => Promise<TaskResult>;
  notify: (text: string, level: "info" | "error") => void;
  onTaskStart: (taskId: string) => void;
  onTaskEnd: (taskId: string, result: TaskResult) => void;
}

/**
 * Identifies impeccable-bound tasks for parallel throttling.
 */
export function isImpeccableTask(id: string): boolean {
  return id === "impeccable-shape" || id.startsWith("craft-") || id === "polish" || id === "audit";
}

/**
 * Dispatch one batch of ready tasks as parallel subagents, await all completions.
 * Returns dispatched task IDs. Caller (runPipeline) handles continuous loop.
 */
export async function advancePipeline(
  targetDir: string,
  driver: PipelineDriver
): Promise<{ dispatched: string[]; done: boolean; failed: string[] }> {
  const state = await loadState(targetDir);
  const ready = getReadyTasks(state.tasks);

  if (ready.length === 0) {
    const allDone = state.tasks.every((t) => t.status === "complete" || t.status === "skipped");
    const failed = state.tasks.filter((t) => t.status === "failed").map((t) => t.id);
    if (allDone) {
      state.phase = "done";
      await saveState(targetDir, state);
      driver.notify("✅ All tasks complete!", "info");
    }
    return { dispatched: [], done: allDone, failed };
  }

  // Enforce maxParallelImpeccable: cap concurrent impeccable-bound tasks
  const maxParallel = state.config?.maxParallelImpeccable ?? 3;
  const runningImpeccable = state.tasks.filter(
    (t) => t.status === "running" && isImpeccableTask(t.id)
  ).length;
  const availableSlots = Math.max(0, maxParallel - runningImpeccable);

  // Split ready tasks into impeccable-bound and non-impeccable
  const impeccableReady = ready.filter((t) => isImpeccableTask(t.id));
  const otherReady = ready.filter((t) => !isImpeccableTask(t.id));

  // Throttle impeccable tasks, dispatch all non-impeccable freely
  const toDispatch = [...otherReady, ...impeccableReady.slice(0, availableSlots)];

  if (toDispatch.length === 0) {
    return { dispatched: [], done: false, failed: [] };
  }

  // Mark dispatched tasks as running
  state.tasks = state.tasks.map((t) =>
    toDispatch.some((r) => r.id === t.id) ? { ...t, status: "running" as const } : t
  );
  await saveState(targetDir, state);

  const dispatched: string[] = toDispatch.map((t) => t.id);
  driver.notify(`Dispatched ${dispatched.length} task(s): ${dispatched.join(", ")}`, "info");

  // Spawn all tasks in parallel, serialize state writes via mutex
  const mutex = createMutex();
  const promises = toDispatch.map(async (task) => {
    driver.onTaskStart(task.id);
    const result = await driver.spawnTask(task, state);
    driver.onTaskEnd(task.id, result);

    // Serialize state updates — parallel tasks must not corrupt state.json
    await mutex.run(async () => {
      const currentState = await loadState(targetDir);
      if (result.status === "complete") {
        currentState.tasks = markTaskComplete(currentState.tasks, task.id);
      } else {
        currentState.tasks = markTaskFailed(currentState.tasks, task.id, result.error ?? "unknown error");
      }
      currentState.phase = determinePhase(currentState);
      await saveState(targetDir, currentState);
    });

    return result;
  });

  const results = await Promise.all(promises);
  const failed = results.filter((r) => r.status === "failed").map((r) => r.taskId);

  return { dispatched, done: false, failed };
}

/**
 * Run full pipeline loop: dispatch batches continuously until done or stalled.
 * Each batch dispatches ready tasks in parallel, waits for all to finish,
 * then checks for newly-ready tasks.
 */
export async function runPipeline(targetDir: string, driver: PipelineDriver): Promise<void> {
  let iterations = 0;
  const maxIterations = 50; // Safety valve

  while (iterations < maxIterations) {
    iterations++;
    const { dispatched, done, failed } = await advancePipeline(targetDir, driver);

    if (done) {
      driver.notify("🎉 Pipeline complete!", "info");
      return;
    }

    if (dispatched.length === 0 && failed.length > 0) {
      driver.notify(`Pipeline stalled — ${failed.length} failed task(s): ${failed.join(", ")}`, "error");
      return;
    }

    if (dispatched.length === 0) {
      // No tasks ready, not done — waiting on running tasks (shouldn't happen in sync loop)
      driver.notify("Pipeline waiting for running tasks...", "info");
      return;
    }
  }

  driver.notify("Pipeline safety limit reached", "error");
}

function determinePhase(state: RunState): RunState["phase"] {
  const ids = state.tasks.filter((t) => t.status === "running" || t.status === "pending").map((t) => t.id);
  if (ids.length === 0) return "done";
  if (ids.some((id) => id.startsWith("cf-"))) return "deploying";
  if (ids.some((id) => id.startsWith("craft-") || id === "impeccable-shape" || id === "polish" || id === "audit" || id === "assemble-page")) return "building";
  if (ids.some((id) => id === "astro-init" || id === "static-init" || id === "shadcn-init" || id === "supabase-provision" || id === "write-context")) return "scaffolding";
  return state.phase;
}
