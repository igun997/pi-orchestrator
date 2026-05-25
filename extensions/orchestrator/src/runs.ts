import { createInitialState, saveState, type RunState } from "@orchestrator/shared";

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
