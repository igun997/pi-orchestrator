import type { Task } from "@orchestrator/shared";

export function planDeployTasks(domain?: string): Task[] {
  const tasks: Task[] = [
    { id: "cf-build", name: "Build Astro site", status: "pending", deps: [] },
    { id: "cf-worker-create", name: "Create CF Worker", status: "pending", deps: ["cf-build"] },
    { id: "cf-secrets-push", name: "Push secrets", status: "pending", deps: ["cf-worker-create"] },
    { id: "cf-deploy", name: "Deploy to CF", status: "pending", deps: ["cf-secrets-push"] }
  ];

  if (domain && domain !== "workers.dev") {
    tasks.push({ id: "cf-domain-attach", name: "Attach custom domain", status: "pending", deps: ["cf-deploy"] });
  }

  return tasks;
}
