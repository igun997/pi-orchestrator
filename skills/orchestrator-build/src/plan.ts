import type { Task } from "@orchestrator/shared";

export function planBuildTasks(sections: { id: string; kind: string }[]): Task[] {
  const tasks: Task[] = [
    { id: "impeccable-shape", name: "Shape site layout", status: "pending", deps: [] }
  ];

  for (const section of sections) {
    tasks.push({
      id: `craft-${section.id}`,
      name: `Craft ${section.id} (${section.kind})`,
      status: "pending",
      deps: ["impeccable-shape"]
    });
  }

  const craftIds = sections.map((s) => `craft-${s.id}`);

  tasks.push(
    { id: "assemble-page", name: "Assemble page", status: "pending", deps: craftIds },
    { id: "polish", name: "Polish page", status: "pending", deps: ["assemble-page"] },
    { id: "audit", name: "Audit page", status: "pending", deps: ["polish"] }
  );

  return tasks;
}
