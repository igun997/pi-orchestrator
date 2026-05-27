import { loadState, saveState, getReadyTasks, markTaskComplete, markTaskFailed, type RunState, type Task } from "@orchestrator/shared";
import { taskToPrompt } from "./executor.js";

export interface PipelineDriver {
  sendMessage: (text: string) => void;
  notify: (text: string, level: "info" | "error") => void;
}

/**
 * Advances the pipeline by one step: picks ready tasks, sends prompts to LLM.
 * Returns task IDs that were dispatched. Extension calls this after each task completion.
 * 
 * Flow:
 * 1. Extension calls advancePipeline()
 * 2. Pipeline finds ready tasks, sends prompts via LLM
 * 3. LLM executes (shell, mcp, impeccable)
 * 4. LLM reports done → extension marks task complete → calls advancePipeline() again
 * 5. Repeat until no ready tasks
 */
export async function advancePipeline(targetDir: string, driver: PipelineDriver): Promise<{ dispatched: string[]; done: boolean; failed: string[] }> {
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
  // Impeccable tasks = impeccable-shape, craft-*, polish, audit
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
  state.tasks = state.tasks.map((t) => toDispatch.some((r) => r.id === t.id) ? { ...t, status: "running" as const } : t);
  await saveState(targetDir, state);

  // Send prompts for dispatched tasks
  const dispatched: string[] = [];
  for (const task of toDispatch) {
    const prompt = taskToPrompt(task, state, targetDir);
    driver.sendMessage(`[Task: ${task.id}]\n\n${prompt}\n\nWhen done, call the orchestrator_task_done tool with taskId: "${task.id}"`);
    dispatched.push(task.id);
  }

  driver.notify(`Dispatched ${dispatched.length} task(s): ${dispatched.join(", ")}`, "info");
  return { dispatched, done: false, failed: [] };
}

/**
 * Mark a task complete and advance pipeline.
 */
export async function completeTask(targetDir: string, taskId: string, driver: PipelineDriver): Promise<void> {
  const state = await loadState(targetDir);
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) {
    driver.notify(`Task not found: ${taskId}`, "error");
    return;
  }

  state.tasks = markTaskComplete(state.tasks, taskId);

  // Advance phase based on completed tasks
  const phases = determinePhase(state);
  state.phase = phases;

  await saveState(targetDir, state);
  driver.notify(`✓ ${taskId} complete`, "info");

  // Auto-advance to next ready tasks
  await advancePipeline(targetDir, driver);
}

/**
 * Mark a task failed.
 */
export async function failTask(targetDir: string, taskId: string, error: string, driver: PipelineDriver): Promise<void> {
  const state = await loadState(targetDir);
  state.tasks = markTaskFailed(state.tasks, taskId, error);
  state.phase = "failed";
  await saveState(targetDir, state);
  driver.notify(`❌ ${taskId} failed: ${error}`, "error");
}

function isImpeccableTask(id: string): boolean {
  return id === "impeccable-shape" || id.startsWith("craft-") || id === "polish" || id === "audit";
}

function determinePhase(state: RunState): RunState["phase"] {
  const ids = state.tasks.filter((t) => t.status === "running" || t.status === "pending").map((t) => t.id);
  if (ids.length === 0) return "done";
  if (ids.some((id) => id.startsWith("cf-"))) return "deploying";
  if (ids.some((id) => id.startsWith("craft-") || id === "impeccable-shape" || id === "polish" || id === "audit" || id === "assemble-page")) return "building";
  if (ids.some((id) => id === "astro-init" || id === "shadcn-init" || id === "supabase-provision" || id === "write-context")) return "scaffolding";
  return state.phase;
}
