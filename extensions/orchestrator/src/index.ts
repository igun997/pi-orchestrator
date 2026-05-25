import { REQUIRED_MCPS, findMissingMcps, loadState, saveState, renderMcpSnippet } from "@orchestrator/shared";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseStartArgs } from "./args.js";
import { createRun, listRuns, renderStatus, resetRun, retryTask } from "./runs.js";
import { verifyTasks } from "./verifier.js";
import { runPipeline } from "./pipeline.js";
import { createExecutor } from "./executor.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export default function orchestratorExtension(pi: ExtensionAPI) {
  pi.registerCommand("orchestrator:start", {
    description: "Start image-to-site orchestration: /orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>",
    handler: async (args, ctx) => {
      const parsed = parseStartArgs(args ?? "");
      const state = await createRun({ targetDir: ctx.cwd, ...parsed });
      ctx.ui.notify(renderStatus(state), "info");

      // Kick off extract skill via LLM
      pi.sendUserMessage(
        `Run /skill:orchestrator-extract on ${ctx.cwd}. Images staged: ${parsed.designSystemImage} and ${parsed.pageImage}. Extract specs, ask gap questions one at a time, then show confirm summary. After user confirms, tell me "confirmed" so I can run the pipeline.`,
        { deliverAs: "followUp" }
      );
    }
  });

  pi.registerCommand("orchestrator:confirm", {
    description: "Confirm orchestrator plan and start seamless execution",
    handler: async (_args, ctx) => {
      const state = await loadState(ctx.cwd);
      if (state.phase !== "confirming" && state.phase !== "questioning") {
        ctx.ui.notify(`Cannot confirm in phase: ${state.phase}`, "error");
        return;
      }

      state.confirmed = true;
      state.phase = "scaffolding";
      await saveState(ctx.cwd, state);
      ctx.ui.notify("Confirmed. Starting seamless execution...", "info");

      // Run pipeline
      const executor = createExecutor({
        targetDir: ctx.cwd,
        shell: async (cmd, cwd) => {
          const { stderr } = await execAsync(cmd, { cwd: cwd ?? ctx.cwd, timeout: 120_000 });
          if (stderr && stderr.includes("ERR")) throw new Error(stderr.slice(0, 500));
        }
      });

      const result = await runPipeline({
        targetDir: ctx.cwd,
        executor,
        onProgress: (s) => ctx.ui.notify(renderStatus(s), "info"),
        dispatchDebug: state.config.autoHeal
          ? async (prompt) => { pi.sendUserMessage(prompt, { deliverAs: "followUp" }); }
          : undefined
      });

      if (result.phase === "done") {
        const url = result.deployment?.url ?? "unknown";
        ctx.ui.notify(`✅ Site deployed: ${url}`, "info");
      } else {
        const failed = result.tasks.filter((t) => t.status === "failed");
        ctx.ui.notify(`❌ Pipeline stopped. Failed: ${failed.map((t) => t.id).join(", ")}`, "error");
      }
    }
  });

  pi.registerCommand("orchestrator:status", {
    description: "Show orchestrator status",
    handler: async (_args, ctx) => {
      try {
        const state = await loadState(ctx.cwd);
        ctx.ui.notify(renderStatus(state), "info");
      } catch {
        ctx.ui.notify("No orchestrator run found in this directory", "info");
      }
    }
  });

  pi.registerCommand("orchestrator:doctor", {
    description: "Show required MCP bootstrap guidance",
    handler: async (_args, ctx) => {
      const missing = findMissingMcps([], REQUIRED_MCPS);
      const message = [`Required MCPs: ${REQUIRED_MCPS.join(", ")}`, "", renderMcpSnippet(missing)].join("\n");
      ctx.ui.notify(message, "info");
    }
  });

  pi.registerCommand("orchestrator:resume", {
    description: "Resume orchestrator run",
    handler: async (_args, ctx) => {
      try {
        const state = await loadState(ctx.cwd);
        const fileExists = async (path: string) => existsSync(path);
        const verified = await verifyTasks(state.tasks, ctx.cwd, fileExists);
        state.tasks = verified;
        await saveState(ctx.cwd, state);

        const invalidated = verified.filter((t, i) => state.tasks[i]?.status === "complete" && t.status === "pending");
        if (invalidated.length > 0) {
          ctx.ui.notify(`Re-verified: ${invalidated.length} tasks reset to pending`, "info");
        }

        ctx.ui.notify(renderStatus(state), "info");

        // If confirmed, resume pipeline
        if (state.confirmed && state.phase !== "done" && state.phase !== "failed") {
          const executor = createExecutor({
            targetDir: ctx.cwd,
            shell: async (cmd, cwd) => {
              const { stderr } = await execAsync(cmd, { cwd: cwd ?? ctx.cwd, timeout: 120_000 });
              if (stderr && stderr.includes("ERR")) throw new Error(stderr.slice(0, 500));
            }
          });

          const result = await runPipeline({
            targetDir: ctx.cwd,
            executor,
            onProgress: (s) => ctx.ui.notify(renderStatus(s), "info")
          });

          if (result.phase === "done") {
            ctx.ui.notify(`✅ Site deployed: ${result.deployment?.url ?? "unknown"}`, "info");
          } else {
            ctx.ui.notify(`Pipeline stopped. Run /orchestrator:status for details.`, "error");
          }
        }
      } catch {
        ctx.ui.notify("No orchestrator run found. Use /orchestrator:start first.", "error");
      }
    }
  });

  pi.registerCommand("orchestrator:list", {
    description: "List orchestrator runs",
    handler: async (_args, ctx) => {
      const runsDir = join(homedir(), ".pi", "orchestrator", "runs");
      const runs = await listRuns(runsDir);
      if (runs.length === 0) {
        ctx.ui.notify("No past runs found.", "info");
      } else {
        const lines = runs.map((r) => `${r.runId.slice(0, 8)} | ${r.phase} | ${r.createdAt}`);
        ctx.ui.notify(lines.join("\n"), "info");
      }
    }
  });

  pi.registerCommand("orchestrator:reset", {
    description: "Reset orchestrator run",
    handler: async (_args, ctx) => {
      const ok = await ctx.ui.confirm("Reset", "Delete .orchestrator/ in this directory?");
      if (!ok) return;
      await resetRun(ctx.cwd);
      ctx.ui.notify("Run reset.", "info");
    }
  });

  pi.registerCommand("orchestrator:retry-task", {
    description: "Retry orchestrator task: /orchestrator:retry-task <task-id>",
    handler: async (args, ctx) => {
      const taskId = args?.trim();
      if (!taskId) {
        ctx.ui.notify("Usage: /orchestrator:retry-task <task-id>", "error");
        return;
      }
      const state = await loadState(ctx.cwd);
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) {
        ctx.ui.notify(`Task not found: ${taskId}`, "error");
        return;
      }
      const updated = retryTask(state, taskId);
      await saveState(ctx.cwd, updated);
      ctx.ui.notify(`Task ${taskId} reset to pending. Run /orchestrator:resume to continue.`, "info");
    }
  });
}
