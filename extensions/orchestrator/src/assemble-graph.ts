import type { Task } from "@orchestrator/shared";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface AssemblyInputs {
  targetDir: string;
  framework: "astro" | "static";
  backend: string;
  domain: string;
  sections: { id: string; kind: string }[];
}

function task(id: string, name: string, deps: string[] = []): Task {
  return { id, name, status: "pending", deps };
}

function planScaffoldTasks(framework: "astro" | "static", backend: string): Task[] {
  if (framework === "static") {
    // Static HTML + Tailwind
    const tasks = [
      task("static-init", "Initialize static project with Tailwind"),
      task("write-context", "Write PRODUCT.md + DESIGN.md")
    ];
    if (backend !== "none") {
      tasks.push(task("supabase-provision", "Provision Supabase backend"));
    }
    return tasks;
  }

  // Astro + Tailwind + shadcn
  const tasks = [
    task("astro-init", "Initialize Astro project with Tailwind"),
    task("write-context", "Write PRODUCT.md + DESIGN.md"),
    task("shadcn-init", "Initialize shadcn/ui", ["astro-init"])
  ];
  if (backend !== "none") {
    tasks.push(task("supabase-provision", "Provision Supabase backend", ["astro-init"]));
  }
  return tasks;
}

function planBuildTasks(sections: { id: string; kind: string }[]): Task[] {
  const tasks: Task[] = [task("impeccable-shape", "Shape site layout")];
  for (const section of sections) {
    tasks.push(task(`craft-${section.id}`, `Craft ${section.id} (${section.kind})`, ["impeccable-shape"]));
  }
  const craftIds = sections.map((s) => `craft-${s.id}`);
  tasks.push(
    task("assemble-page", "Assemble page", craftIds),
    task("polish", "Polish page", ["assemble-page"]),
    task("audit", "Audit page", ["polish"])
  );
  return tasks;
}

function planDeployTasks(domain?: string): Task[] {
  const tasks: Task[] = [
    task("cf-build", "Build site"),
    task("cf-worker-create", "Create CF Worker", ["cf-build"]),
    task("cf-secrets-push", "Push secrets", ["cf-worker-create"]),
    task("cf-deploy", "Deploy to CF", ["cf-secrets-push"])
  ];
  if (domain && domain !== "workers.dev") {
    tasks.push(task("cf-domain-attach", "Attach custom domain", ["cf-deploy"]));
  }
  return tasks;
}

/**
 * Assembles the full task graph from scaffold + build + deploy.
 * Called after confirm, uses answers to determine framework/backend/domain.
 */
export function assembleTaskGraph(inputs: AssemblyInputs): Task[] {
  const scaffoldTasks = planScaffoldTasks(inputs.framework, inputs.backend);
  const buildTasks = planBuildTasks(inputs.sections);

  // Skip deploy entirely if domain is "none"
  const skipDeploy = !inputs.domain || inputs.domain === "none";
  const deployTasks = skipDeploy ? [] : planDeployTasks(inputs.domain === "workers.dev" ? undefined : inputs.domain);

  // Build tasks root (impeccable-shape) depends on all scaffold tasks
  const scaffoldIds = scaffoldTasks.map((t) => t.id);
  const buildWithDeps = buildTasks.map((t) => {
    if (t.deps.length === 0) return { ...t, deps: scaffoldIds };
    return t;
  });

  // Deploy root (cf-build) depends on audit
  const deployWithDeps = skipDeploy ? [] : deployTasks.map((t) => {
    if (t.deps.length === 0) return { ...t, deps: ["audit"] };
    return t;
  });

  // Wire supabase client if needed (only for astro)
  const wireTask: Task[] = inputs.backend !== "none" && inputs.framework === "astro"
    ? [task("wire-supabase", "Wire Supabase client", ["supabase-provision", "astro-init"])]
    : [];

  return [...scaffoldTasks, ...wireTask, ...buildWithDeps, ...deployWithDeps];
}

/**
 * Reads page-spec.json and extracts sections for task graph assembly.
 */
export async function loadSectionsFromSpec(targetDir: string): Promise<{ id: string; kind: string }[]> {
  const specPath = join(targetDir, ".orchestrator/specs/page-spec.json");
  const raw = await readFile(specPath, "utf8");
  const spec = JSON.parse(raw) as { sections: { id: string; kind: string }[] };
  return spec.sections;
}
