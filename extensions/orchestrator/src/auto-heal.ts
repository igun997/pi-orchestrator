export type DispatchDebug = (prompt: string) => Promise<void>;

export interface AutoHealArgs {
  autoHeal: boolean;
  taskId: string;
  errorRef: string;
  healedTasks: Set<string>;
  dispatch: DispatchDebug;
}

export async function maybeAutoHeal(args: AutoHealArgs): Promise<"healed" | "skipped"> {
  if (!args.autoHeal) return "skipped";
  if (args.healedTasks.has(args.taskId)) return "skipped";

  const prompt = `Task "${args.taskId}" failed. Error log: ${args.errorRef}. Diagnose and fix.`;
  await args.dispatch(prompt);
  args.healedTasks.add(args.taskId);
  return "healed";
}
