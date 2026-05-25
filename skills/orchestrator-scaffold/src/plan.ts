import type { Task } from "@orchestrator/shared";

function task(id: string, name: string, deps: string[] = []): Task {
  return { id, name, status: "pending", deps };
}

export function planScaffoldTasks(backend: string): Task[] {
  const tasks = [
    task("astro-init", "Initialize Astro project"),
    task("write-context", "Write PRODUCT.md + DESIGN.md"),
    task("shadcn-init", "Initialize shadcn/ui", ["astro-init"])
  ];

  if (backend !== "none") {
    tasks.push(task("supabase-provision", "Provision Supabase backend", ["astro-init"]));
  }

  return tasks;
}
