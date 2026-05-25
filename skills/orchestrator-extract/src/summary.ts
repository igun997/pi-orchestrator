export function renderConfirmSummary(args: {
  answers: Record<string, unknown>;
  sectionCount: number;
  taskCount: number;
}): string {
  return [
    "# Orchestrator confirmation",
    "",
    `Product: ${args.answers["product-name"] ?? "(unset)"}`,
    `Backend: ${args.answers["backend-level"] ?? "none"}`,
    `Build: ${args.sectionCount} sections`,
    `Task graph: ${args.taskCount} tasks`,
    "",
    "Type `confirm` to run seamless mode."
  ].join("\n");
}
