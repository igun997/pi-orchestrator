import { createInitialState, saveState, type RunState } from "@orchestrator/shared";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

export async function createRun(args: { targetDir: string; designSystemImage: string; pageImage: string; autoHeal: boolean }): Promise<RunState> {
  const state = createInitialState(args);
  state.phase = "extracting";
  state.tasks = [
    { id: "extract-design-system", name: "Extract design system", status: "pending", deps: [] },
    { id: "extract-page", name: "Extract page", status: "pending", deps: [] },
    { id: "questions", name: "Ask gap questions", status: "pending", deps: ["extract-design-system", "extract-page"] },
    { id: "confirm", name: "Confirm plan", status: "pending", deps: ["questions"] }
  ];

  await saveState(args.targetDir, state);
  return state;
}

export function renderStatus(state: RunState): string {
  const done = state.tasks.filter((task) => task.status === "complete").length;
  return `Run ${state.runId}\nPhase: ${state.phase}\nTasks: ${done}/${state.tasks.length} complete`;
}

export async function listRuns(runsDir: string): Promise<{ runId: string; createdAt: string; phase: string }[]> {
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch {
    return [];
  }

  const results: { runId: string; createdAt: string; phase: string }[] = [];
  for (const entry of entries) {
    try {
      const raw = await readFile(join(runsDir, entry, "summary.json"), "utf8");
      const data = JSON.parse(raw) as { runId: string; createdAt: string; phase: string };
      results.push(data);
    } catch {
      // skip invalid entries
    }
  }
  return results;
}

export async function resetRun(targetDir: string): Promise<void> {
  await rm(join(targetDir, ".orchestrator"), { recursive: true, force: true });
}

export function retryTask(state: RunState, taskId: string): RunState {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status: "pending" as const, errorRef: undefined } : t))
  };
}
