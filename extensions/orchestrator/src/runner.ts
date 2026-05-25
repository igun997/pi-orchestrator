import { getReadyTasks, markTaskComplete, markTaskFailed, type RunState, type Task } from "@orchestrator/shared";

function errorRef(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runReadyTasks(state: RunState, executor: (task: Task) => Promise<void>): Promise<RunState> {
  const readyTasks = getReadyTasks(state.tasks);
  let tasks = state.tasks.map((task) => (readyTasks.some((ready) => ready.id === task.id) ? { ...task, status: "running" as const } : task));

  const results = await Promise.allSettled(readyTasks.map((task) => executor(task)));

  for (const [index, result] of results.entries()) {
    const task = readyTasks[index];
    if (!task) continue;
    tasks = result.status === "fulfilled" ? markTaskComplete(tasks, task.id) : markTaskFailed(tasks, task.id, errorRef(result.reason));
  }

  return { ...state, tasks };
}
