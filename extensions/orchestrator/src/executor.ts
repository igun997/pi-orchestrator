import type { Task, RunState } from "@orchestrator/shared";
import { loadState } from "@orchestrator/shared";

export interface ExecutorDeps {
  targetDir: string;
  shell: (cmd: string, cwd?: string) => Promise<void>;
  mcpCall?: (server: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;
}

export function createExecutor(deps: ExecutorDeps): (task: Task) => Promise<void> {
  return async (task: Task) => {
    const state = await loadState(deps.targetDir);

    switch (task.id) {
      // === Extract phase (handled by skill before seamless mode) ===
      case "extract-design-system":
      case "extract-page":
      case "questions":
      case "confirm":
        // These are driven by the extract skill interactively, not by pipeline
        return;

      // === Scaffold phase ===
      case "astro-init":
        await deps.shell(`pnpm create astro@latest ${slugFromState(state)} --template minimal --typescript strict --install --no-git --skip-houston`, deps.targetDir);
        await deps.shell(`pnpm astro add cloudflare --yes`, projectDir(deps.targetDir, state));
        await deps.shell(`pnpm astro add react --yes`, projectDir(deps.targetDir, state));
        await deps.shell(`pnpm astro add tailwind --yes`, projectDir(deps.targetDir, state));
        return;

      case "supabase-provision":
        if (deps.mcpCall) {
          const slug = slugFromState(state);
          await deps.mcpCall("supabase", "create_project", { name: slug });
          const schemaLevel = (state.answers["backend-level"] as string) ?? "none";
          if (schemaLevel !== "none") {
            // Schema applied via MCP
            await deps.mcpCall("supabase", "apply_schema", { project: slug, level: schemaLevel });
          }
        }
        return;

      case "shadcn-init":
        await deps.shell(`pnpm dlx shadcn@latest init --yes`, projectDir(deps.targetDir, state));
        // Add detected components
        const components = (state.answers["shadcn-components"] as string[]) ?? [];
        for (const comp of components) {
          await deps.shell(`pnpm dlx shadcn@latest add ${comp} --yes`, projectDir(deps.targetDir, state));
        }
        return;

      case "write-context":
        await deps.shell(`pnpm --filter @orchestrator/context run extract -- ${deps.targetDir}`, deps.targetDir);
        return;

      // === Build phase ===
      case "impeccable-shape":
        await deps.shell(`npx impeccable shape "site layout"`, projectDir(deps.targetDir, state));
        return;

      case "assemble-page":
        // Handled programmatically by build skill
        await deps.shell(`pnpm --filter @orchestrator/build run assemble -- ${deps.targetDir}`, deps.targetDir);
        return;

      case "wire-supabase":
        await deps.shell(`pnpm --filter @orchestrator/build run wire-supabase -- ${deps.targetDir}`, deps.targetDir);
        return;

      case "polish":
        await deps.shell(`npx impeccable polish src/pages/index.astro`, projectDir(deps.targetDir, state));
        return;

      case "audit":
        await deps.shell(`npx impeccable audit src/pages/index.astro`, projectDir(deps.targetDir, state));
        return;

      // === Deploy phase ===
      case "cf-build":
        await deps.shell(`pnpm build`, projectDir(deps.targetDir, state));
        return;

      case "cf-worker-create":
        if (deps.mcpCall) {
          await deps.mcpCall("cloudflare", "create_worker", { name: slugFromState(state) });
        }
        return;

      case "cf-secrets-push":
        if (deps.mcpCall) {
          const slug = slugFromState(state);
          const secrets = extractSecrets(state);
          for (const [key, value] of Object.entries(secrets)) {
            await deps.mcpCall("cloudflare", "put_secret", { worker: slug, key, value });
          }
        }
        return;

      case "cf-deploy":
        if (deps.mcpCall) {
          const result = await deps.mcpCall("cloudflare", "deploy", {
            name: slugFromState(state),
            source: "dist/"
          }) as { url?: string };
          if (result?.url) {
            const updated = await loadState(deps.targetDir);
            updated.deployment = { url: result.url };
            const { saveState } = await import("@orchestrator/shared");
            await saveState(deps.targetDir, updated);
          }
        }
        return;

      case "cf-domain-attach":
        if (deps.mcpCall) {
          const domain = state.answers["domain"] as string;
          if (domain && domain !== "workers.dev") {
            await deps.mcpCall("cloudflare", "add_route", { pattern: domain, worker: slugFromState(state) });
          }
        }
        return;

      default:
        // craft-{section} tasks
        if (task.id.startsWith("craft-")) {
          const sectionId = task.id.replace("craft-", "");
          const section = findSection(state, sectionId);
          await deps.shell(
            `npx impeccable craft "${sectionId}: ${section?.kind ?? "section"}"`,
            projectDir(deps.targetDir, state)
          );
          return;
        }
        throw new Error(`Unknown task: ${task.id}`);
    }
  };
}

function slugFromState(state: RunState): string {
  const name = (state.answers["product-name"] as string) ?? "site";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
}

function projectDir(targetDir: string, state: RunState): string {
  return `${targetDir}/${slugFromState(state)}`;
}

function findSection(state: RunState, sectionId: string): { id: string; kind: string } | undefined {
  // Section info stored in specs, but we just need the id/kind for the command
  return { id: sectionId, kind: sectionId };
}

function extractSecrets(state: RunState): Record<string, string> {
  const secrets: Record<string, string> = {};
  if (state.stack && typeof state.stack === "object") {
    const s = state.stack as Record<string, unknown>;
    if (s["SUPABASE_URL"]) secrets["SUPABASE_URL"] = s["SUPABASE_URL"] as string;
    if (s["SUPABASE_ANON_KEY"]) secrets["SUPABASE_ANON_KEY"] = s["SUPABASE_ANON_KEY"] as string;
  }
  return secrets;
}
