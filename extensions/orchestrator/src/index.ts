import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseStartArgs } from "./args.js";

export default function orchestratorExtension(pi: ExtensionAPI) {
  pi.registerCommand("orchestrator:start", {
    description: "Start image-to-site orchestration: /orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>",
    handler: async (args, ctx) => {
      const parsed = parseStartArgs(args ?? "");
      ctx.ui.notify(`Starting orchestrator for ${parsed.designSystemImage} + ${parsed.pageImage}`, "info");
    }
  });

  pi.registerCommand("orchestrator:status", {
    description: "Show orchestrator status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("No run loaded", "info");
    }
  });

  pi.registerCommand("orchestrator:resume", {
    description: "Resume orchestrator run",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Resume not implemented yet", "info");
    }
  });

  pi.registerCommand("orchestrator:list", {
    description: "List orchestrator runs",
    handler: async (_args, ctx) => {
      ctx.ui.notify("List not implemented yet", "info");
    }
  });

  pi.registerCommand("orchestrator:reset", {
    description: "Reset orchestrator run",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Reset not implemented yet", "info");
    }
  });

  pi.registerCommand("orchestrator:retry-task", {
    description: "Retry orchestrator task",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Retry not implemented yet", "info");
    }
  });
}
