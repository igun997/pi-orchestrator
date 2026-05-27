import type { Task, RunState } from "@orchestrator/shared";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { taskToPrompt } from "./executor.js";
import { isImpeccableTask } from "./pipeline.js";
import { createSubagentTools } from "./tools.js";

export interface SubagentOptions {
  model: any;
  modelRegistry: any;
  cwd: string;
  impeccableSkillPath?: string | undefined;
  onProgress?: ((update: string) => void) | undefined;
}

export interface TaskResult {
  taskId: string;
  status: "complete" | "failed";
  error?: string;
  durationMs: number;
}

const BUILTIN_TOOLS = ["read", "write", "edit", "bash", "grep", "find", "ls"];

export async function spawnTaskAgent(
  task: Task,
  state: RunState,
  targetDir: string,
  options: SubagentOptions
): Promise<TaskResult> {
  const startedAt = Date.now();
  const taskPrompt = taskToPrompt(task, state, targetDir);
  const customTools = createSubagentTools(targetDir);
  let session: { prompt: (prompt: string) => Promise<unknown>; dispose: () => void | Promise<void> } | undefined;

  options.onProgress?.(`Starting task ${task.id}`);

  try {
    const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: options.cwd,
      agentDir: join(homedir(), ".pi/agent"),
      settingsManager,
      additionalExtensionPaths: [],
      extensionFactories: [],
      noExtensions: true,
      systemPromptOverride: () => subagentSystemPrompt(task.id),
      skillsOverride: (current: any) => injectImpeccableSkill(current, task.id, options.impeccableSkillPath),
    });

    if (typeof resourceLoader.reload === "function") {
      await resourceLoader.reload();
    }

    const result = await createAgentSession({
      cwd: options.cwd,
      model: options.model,
      modelRegistry: options.modelRegistry,
      authStorage: options.modelRegistry?.authStorage,
      tools: BUILTIN_TOOLS,
      customTools,
      resourceLoader,
      sessionManager: SessionManager.inMemory(),
      settingsManager,
      thinkingLevel: "off",
    } as any);

    session = result.session;
    await session.prompt(taskPrompt);

    const durationMs = Date.now() - startedAt;
    options.onProgress?.(`Completed task ${task.id} in ${durationMs}ms`);
    return { taskId: task.id, status: "complete", durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    options.onProgress?.(`Failed task ${task.id}: ${message}`);
    return { taskId: task.id, status: "failed", error: message, durationMs };
  } finally {
    await session?.dispose();
  }
}

function subagentSystemPrompt(taskId: string): string {
  return `You are an isolated pi subagent executing one orchestrator pipeline task.
Task ID: ${taskId}

Complete only this task. Use provided tools. Report concise completion or failure. Do not load extensions recursively.`;
}

function injectImpeccableSkill(current: any, taskId: string, skillPath?: string): any {
  if (!isImpeccableTask(taskId) || !skillPath) return current;

  const skillDir = dirname(skillPath);
  return {
    skills: [
      ...current.skills,
      {
        name: "impeccable",
        description: "Frontend design, UX, visual polish, accessibility, responsive UI, and implementation quality skill.",
        filePath: skillPath,
        baseDir: skillDir,
        source: "orchestrator",
        sourceInfo: {
          path: skillPath,
          source: "orchestrator",
          scope: "temporary",
          origin: "top-level",
          baseDir: skillDir,
        },
        disableModelInvocation: false,
      },
    ],
    diagnostics: current.diagnostics,
  };
}
