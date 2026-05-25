import { loadState, saveState, type RunState, type Task, classifyError, retryClassified, writeTaskLog, errorRef } from "@orchestrator/shared";
import { runReadyTasks } from "./runner.js";
import { maybeAutoHeal, type DispatchDebug } from "./auto-heal.js";

export interface PipelineContext {
  targetDir: string;
  executor: (task: Task) => Promise<void>;
  onProgress?: ((state: RunState) => void) | undefined;
  dispatchDebug?: DispatchDebug | undefined;
}

export async function runPipeline(ctx: PipelineContext): Promise<RunState> {
  let state = await loadState(ctx.targetDir);
  const healedTasks = new Set<string>();

  while (true) {
    const readyTasks = state.tasks.filter((t) => t.status === "pending")
      .filter((t) => t.deps.every((dep) => state.tasks.find((d) => d.id === dep)?.status === "complete"));

    if (readyTasks.length === 0) break;

    state = await runReadyTasks(state, async (task) => {
      await retryClassified(
        () => ctx.executor(task),
        { retries: 3, delayMs: 1000, classify: classifyError }
      );
    });

    // Handle failures
    const failedTasks = state.tasks.filter((t) => t.status === "failed");
    for (const failed of failedTasks) {
      await writeTaskLog(ctx.targetDir, failed.id, failed.errorRef ?? "unknown error");

      if (ctx.dispatchDebug) {
        const result = await maybeAutoHeal({
          autoHeal: true,
          taskId: failed.id,
          errorRef: errorRef(failed.id),
          healedTasks,
          dispatch: ctx.dispatchDebug
        });
        if (result === "healed") {
          state = {
            ...state,
            tasks: state.tasks.map((t) => t.id === failed.id ? { ...t, status: "pending" as const, errorRef: undefined } : t)
          };
        }
      }
    }

    // If still have failures after heal attempt, stop
    if (state.tasks.some((t) => t.status === "failed")) break;

    await saveState(ctx.targetDir, state);
    ctx.onProgress?.(state);
  }

  // Determine final phase
  const allComplete = state.tasks.every((t) => t.status === "complete" || t.status === "skipped");
  if (allComplete) state.phase = "done";
  else if (state.tasks.some((t) => t.status === "failed")) state.phase = "failed";

  await saveState(ctx.targetDir, state);
  return state;
}
