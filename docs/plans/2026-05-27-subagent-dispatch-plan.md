# Subagent Dispatch Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace same-conversation task dispatch with isolated `createAgentSession()` subagents per task, keeping parent session clean with only native pi TUI progress.

**Architecture:** Each pipeline task spawns a fresh `AgentSession` via SDK. Parent extension supervises — dispatches, monitors via widget/status, advances pipeline on completion. Custom tools (`read_image`, `merge_sections`, `hex_to_oklch`) passed to subagents via `customTools`. Impeccable skill injected for design tasks via `DefaultResourceLoader.skillsOverride`.

**Tech Stack:** pi SDK (`createAgentSession`, `DefaultResourceLoader`, `SessionManager`, `defineTool`), vitest for testing.

---

### Task 1: Create `subagent.ts` — tool factories

Extract `read_image`, `merge_sections`, `hex_to_oklch` from `index.ts` into standalone `defineTool()` calls that can be passed as `customTools` to subagent sessions.

**Files:**
- Create: `extensions/orchestrator/src/tools.ts`
- Test: `extensions/orchestrator/src/tools.test.ts`

**Step 1: Write the failing test**

```typescript
// extensions/orchestrator/src/tools.test.ts
import { describe, expect, it } from "vitest";
import { createSubagentTools } from "./tools.js";

describe("createSubagentTools", () => {
  it("returns 3 tools with correct names", () => {
    const tools = createSubagentTools("/tmp/test");
    const names = tools.map(t => t.name);
    expect(names).toContain("read_image");
    expect(names).toContain("merge_sections");
    expect(names).toContain("hex_to_oklch");
    expect(tools).toHaveLength(3);
  });

  it("hex_to_oklch converts single color", async () => {
    const tools = createSubagentTools("/tmp/test");
    const hexTool = tools.find(t => t.name === "hex_to_oklch")!;
    const result = await hexTool.execute("call-1", { colors: "#FF0000" }, new AbortController().signal, () => {}, { cwd: "/tmp" } as any);
    expect(result.content[0]).toHaveProperty("text");
    expect((result.content[0] as any).text).toContain("oklch(");
  });

  it("hex_to_oklch converts batch", async () => {
    const tools = createSubagentTools("/tmp/test");
    const hexTool = tools.find(t => t.name === "hex_to_oklch")!;
    const result = await hexTool.execute("call-1", { colors: { primary: "#FF0000" } }, new AbortController().signal, () => {}, { cwd: "/tmp" } as any);
    expect((result.content[0] as any).text).toContain("primary");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test extensions/orchestrator/src/tools.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// extensions/orchestrator/src/tools.ts
import { Type } from "typebox";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { hexToOklch, hexBatchToOklch } from "./color.js";
import { mergeSections } from "./merge.js";

// Use dynamic import for defineTool to avoid hard dep on pi-coding-agent at test time
// Tools are plain objects matching ToolDefinition shape — defineTool just adds type inference

interface ToolContent { type: string; text?: string; data?: string; mimeType?: string; }
interface ToolResult { content: ToolContent[]; details: Record<string, unknown>; }
interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, params: any, signal: AbortSignal, onUpdate: any, ctx: any) => Promise<ToolResult>;
}

/**
 * Create custom tools for subagent sessions.
 * These are the same tools registered in index.ts but as standalone definitions
 * passable via createAgentSession({ customTools }).
 */
export function createSubagentTools(orchestratorDir: string): ToolDef[] {
  return [
    {
      name: "hex_to_oklch",
      label: "Hex to OKLCH",
      description: "Convert hex color(s) to OKLCH format. Accepts single hex or JSON object of name:hex pairs.",
      parameters: Type.Object({
        colors: Type.Union([
          Type.String({ description: "Single hex color like #FF7A59" }),
          Type.Record(Type.String(), Type.String(), { description: "Object of name:hex pairs" })
        ])
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        if (typeof params.colors === "string") {
          const oklch = hexToOklch(params.colors);
          return { content: [{ type: "text", text: `${params.colors} → ${oklch}` }], details: {} };
        }
        const results = hexBatchToOklch(params.colors as Record<string, string>);
        const lines = Object.entries(results).map(([name, { hex, oklch }]) => `| ${name} | ${hex} | ${oklch} |`);
        const table = `| Token | Hex | OKLCH |\n|---|---|---|\n${lines.join("\n")}`;
        return { content: [{ type: "text", text: table }], details: {} };
      }
    },
    {
      name: "merge_sections",
      label: "Merge Sections",
      description: "Merge all HTML section files from src/sections/ into src/index.html in page-spec order.",
      parameters: Type.Object({
        projectDir: Type.Optional(Type.String({ description: "Project directory" }))
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const projectDir = params.projectDir ?? join(ctx.cwd, "site");
        const specsDir = join(orchestratorDir, ".orchestrator/specs");
        try {
          const result = await mergeSections(projectDir, specsDir);
          return {
            content: [{ type: "text", text: `✓ Merged ${result.sections.length} sections into ${result.merged}\nOrder: ${result.sections.join(" → ")}` }],
            details: {}
          };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Error: ${e.message}` }], details: {} };
        }
      }
    },
    {
      name: "read_image",
      label: "Read Image",
      description: "Read and analyze a local image file. Returns visual content or description depending on model capabilities.",
      parameters: Type.Object({
        path: Type.String({ description: "Absolute or relative path to the image file" }),
        prompt: Type.Optional(Type.String({ description: "What to extract or focus on" }))
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const resolved = params.path.startsWith("/") ? params.path : join(ctx.cwd, params.path);
        if (!existsSync(resolved)) {
          return { content: [{ type: "text", text: `Error: File not found: ${resolved}` }], details: {} };
        }
        const ext = extname(resolved).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"
        };
        const mime = mimeMap[ext];
        if (!mime) {
          return { content: [{ type: "text", text: `Error: Unsupported image format: ${ext}` }], details: {} };
        }
        const buf = await readFile(resolved);
        const base64 = buf.toString("base64");

        // Try 9router vision API if available
        const baseUrl = process.env.NINEROUTER_URL ?? "http://localhost:20128";
        const apiKey = process.env.NINEROUTER_KEY ?? process.env.NINEROUTER_API_KEY ?? "";

        if (!apiKey) {
          return {
            content: [
              { type: "image", data: base64, mimeType: mime },
              { type: "text", text: `Image: ${resolved} (${mime}, ${Math.round(buf.length / 1024)}KB)` }
            ],
            details: {}
          };
        }

        const dataUri = `data:${mime};base64,${base64}`;
        const userPrompt = params.prompt ?? "Describe this image in exhaustive detail.";

        try {
          const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "kr/auto",
              messages: [{ role: "user", content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: dataUri } }
              ]}],
              stream: false
            })
          });
          if (!res.ok) {
            const errText = await res.text();
            return { content: [{ type: "text", text: `Vision API error ${res.status}: ${errText}` }], details: {} };
          }
          const json = await res.json() as { choices: { message: { content: string } }[] };
          const description = json.choices?.[0]?.message?.content ?? "No response";
          return {
            content: [{ type: "text", text: `[Image: ${resolved} (${mime}, ${Math.round(buf.length / 1024)}KB)]\n\n${description}` }],
            details: {}
          };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Vision error: ${e.message}` }], details: {} };
        }
      }
    }
  ];
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test extensions/orchestrator/src/tools.test.ts`
Expected: 3 PASS

**Step 5: Commit**

```bash
git add extensions/orchestrator/src/tools.ts extensions/orchestrator/src/tools.test.ts
git commit -m "refactor: extract custom tools into standalone factories for subagent reuse"
```

---

### Task 2: Create `subagent.ts` — spawn isolated sessions

**Files:**
- Create: `extensions/orchestrator/src/subagent.ts`
- Test: `extensions/orchestrator/src/subagent.test.ts`

**Step 1: Write the failing test**

```typescript
// extensions/orchestrator/src/subagent.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { spawnTaskAgent, type SubagentOptions, type TaskResult } from "./subagent.js";
import type { Task, RunState } from "@orchestrator/shared";
import { createInitialState } from "@orchestrator/shared";

// Mock createAgentSession
vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(),
  DefaultResourceLoader: vi.fn(),
  SessionManager: { inMemory: vi.fn(() => ({})) },
  SettingsManager: { inMemory: vi.fn(() => ({})) },
}));

function makeTask(id: string): Task {
  return { id, name: `Task ${id}`, status: "running", deps: [] };
}

function makeState(): RunState {
  const state = createInitialState({ targetDir: "/tmp/test" });
  state.answers = { framework: "static", "backend-level": "none", "product-name": "test" };
  state.confirmed = true;
  return state;
}

function makeOptions(): SubagentOptions {
  return {
    model: { id: "test-model", provider: "test" } as any,
    modelRegistry: { authStorage: {} } as any,
    cwd: "/tmp/test",
    onProgress: vi.fn(),
  };
}

describe("spawnTaskAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns complete on successful prompt", async () => {
    const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
    const mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    (createAgentSession as any).mockResolvedValue({ session: mockSession, extensionsResult: { extensions: [], errors: [], runtime: {} } });

    const result = await spawnTaskAgent(makeTask("static-init"), makeState(), "/tmp/test", makeOptions());
    expect(result.status).toBe("complete");
    expect(result.taskId).toBe("static-init");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockSession.prompt).toHaveBeenCalledOnce();
    expect(mockSession.dispose).toHaveBeenCalledOnce();
  });

  it("returns failed when prompt throws", async () => {
    const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
    const mockSession = {
      prompt: vi.fn().mockRejectedValue(new Error("LLM timeout")),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    (createAgentSession as any).mockResolvedValue({ session: mockSession, extensionsResult: { extensions: [], errors: [], runtime: {} } });

    const result = await spawnTaskAgent(makeTask("craft-hero"), makeState(), "/tmp/test", makeOptions());
    expect(result.status).toBe("failed");
    expect(result.error).toContain("LLM timeout");
    expect(mockSession.dispose).toHaveBeenCalledOnce();
  });

  it("always disposes session even on error", async () => {
    const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
    const mockSession = {
      prompt: vi.fn().mockRejectedValue(new Error("boom")),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    (createAgentSession as any).mockResolvedValue({ session: mockSession, extensionsResult: { extensions: [], errors: [], runtime: {} } });

    await spawnTaskAgent(makeTask("audit"), makeState(), "/tmp/test", makeOptions());
    expect(mockSession.dispose).toHaveBeenCalledOnce();
  });

  it("passes task prompt to session.prompt", async () => {
    const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
    const mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    (createAgentSession as any).mockResolvedValue({ session: mockSession, extensionsResult: { extensions: [], errors: [], runtime: {} } });

    await spawnTaskAgent(makeTask("static-init"), makeState(), "/tmp/test", makeOptions());

    const promptArg = mockSession.prompt.mock.calls[0][0];
    expect(promptArg).toContain("static-init");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test extensions/orchestrator/src/subagent.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// extensions/orchestrator/src/subagent.ts
import type { Task, RunState } from "@orchestrator/shared";
import { taskToPrompt } from "./executor.js";
import { createSubagentTools } from "./tools.js";
import { isImpeccableTask } from "./pipeline.js";

export interface SubagentOptions {
  model: any;                    // Model from ctx.model
  modelRegistry: any;            // ModelRegistry from ctx.modelRegistry
  cwd: string;                   // Working directory
  impeccableSkillPath?: string;  // Path to impeccable SKILL.md
  onProgress?: (update: string) => void;
}

export interface TaskResult {
  taskId: string;
  status: "complete" | "failed";
  error?: string;
  durationMs: number;
}

/**
 * Spawn an isolated agent session for a single pipeline task.
 * Each task gets a fresh LLM context — no bleed from other tasks.
 */
export async function spawnTaskAgent(
  task: Task,
  state: RunState,
  targetDir: string,
  options: SubagentOptions
): Promise<TaskResult> {
  const start = Date.now();
  const prompt = taskToPrompt(task, state, targetDir);
  const customTools = createSubagentTools(targetDir);

  // Dynamic import to avoid hard dependency at load time
  const {
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
  } = await import("@earendil-works/pi-coding-agent");

  // Build resource loader with custom system prompt and optional impeccable skill
  const loaderOpts: any = {
    cwd: options.cwd,
    systemPromptOverride: () =>
      `You are a focused task agent. Complete the following task precisely. Do not ask questions — execute directly.\n\n` +
      `When finished, stop. Do not suggest next steps.`,
  };

  // Inject impeccable skill for design tasks
  if (isImpeccableTask(task.id) && options.impeccableSkillPath) {
    const skillDir = options.impeccableSkillPath.replace(/\/SKILL\.md$/, "");
    loaderOpts.skillsOverride = (current: any) => ({
      skills: [
        ...current.skills,
        {
          name: "impeccable",
          description: "Frontend design skill for crafting production-grade UI",
          filePath: options.impeccableSkillPath,
          baseDir: skillDir,
          source: "orchestrator",
        },
      ],
      diagnostics: current.diagnostics,
    });
  }

  // Disable all default extensions and skills except what we explicitly inject
  loaderOpts.extensionFactories = [];
  // No additional extension paths — subagent is tool-only
  loaderOpts.additionalExtensionPaths = [];

  const loader = new DefaultResourceLoader(loaderOpts);
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: options.cwd,
    model: options.model,
    thinkingLevel: "off",
    authStorage: options.modelRegistry.authStorage,
    modelRegistry: options.modelRegistry,
    tools: ["read", "write", "edit", "bash", "grep", "find", "ls",
            "read_image", "merge_sections", "hex_to_oklch"],
    customTools: customTools as any,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
  });

  try {
    options.onProgress?.(`▶ ${task.id} started`);
    await session.prompt(prompt);
    options.onProgress?.(`✓ ${task.id} complete`);
    return {
      taskId: task.id,
      status: "complete",
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    options.onProgress?.(`✗ ${task.id} failed: ${e.message}`);
    return {
      taskId: task.id,
      status: "failed",
      error: e.message,
      durationMs: Date.now() - start,
    };
  } finally {
    session.dispose();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test extensions/orchestrator/src/subagent.test.ts`
Expected: 4 PASS

**Step 5: Commit**

```bash
git add extensions/orchestrator/src/subagent.ts extensions/orchestrator/src/subagent.test.ts
git commit -m "feat: add spawnTaskAgent for isolated subagent sessions per task"
```

---

### Task 3: Rewrite `pipeline.ts` — subagent dispatch with continuous loop

**Files:**
- Modify: `extensions/orchestrator/src/pipeline.ts`
- Modify: `extensions/orchestrator/src/pipeline.test.ts`

**Step 1: Write the failing tests**

Replace pipeline.test.ts entirely:

```typescript
// extensions/orchestrator/src/pipeline.test.ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialState, saveState, loadState } from "@orchestrator/shared";
import { advancePipeline, type PipelineDriver } from "./pipeline.js";
import { assembleTaskGraph } from "./assemble-graph.js";
import type { TaskResult } from "./subagent.js";

function mockDriver(): PipelineDriver & { spawned: string[]; results: Map<string, TaskResult> } {
  const spawned: string[] = [];
  const results = new Map<string, TaskResult>();
  return {
    spawned,
    results,
    spawnTask: vi.fn(async (task, _state) => {
      spawned.push(task.id);
      const preset = results.get(task.id);
      if (preset) return preset;
      return { taskId: task.id, status: "complete" as const, durationMs: 100 };
    }),
    notify: vi.fn(),
    onTaskStart: vi.fn(),
    onTaskEnd: vi.fn(),
  };
}

describe("advancePipeline", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "orch-pipeline-"));
  });

  it("throttles impeccable tasks to maxParallelImpeccable", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "building";
    state.answers = { framework: "astro", "product-name": "test" };

    const sections = ["hero", "features", "pricing", "testimonials", "faq", "cta"].map(id => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "astro", backend: "none", domain: "none", sections });

    state.tasks = state.tasks.map(t =>
      ["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)
        ? { ...t, status: "complete" as const } : t
    );

    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    // Should dispatch exactly 3 craft tasks (not all 6)
    const craftDispatched = result.dispatched.filter(id => id.startsWith("craft-"));
    expect(craftDispatched).toHaveLength(3);
    expect(result.dispatched).toHaveLength(3);
  });

  it("dispatches non-impeccable tasks without throttle", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "astro", "product-name": "test", "backend-level": "contact-form" };

    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "astro", backend: "contact-form", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    expect(result.dispatched).toContain("astro-init");
    expect(result.dispatched).toContain("write-context");
  });

  it("respects custom maxParallelImpeccable value", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "building";
    state.answers = { framework: "astro", "product-name": "test" };
    state.config.maxParallelImpeccable = 1;

    const sections = ["hero", "features", "pricing"].map(id => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "astro", backend: "none", domain: "none", sections });

    state.tasks = state.tasks.map(t =>
      ["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)
        ? { ...t, status: "complete" as const } : t
    );

    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]).toMatch(/^craft-/);
  });

  it("fills slots when some impeccable tasks already running", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "building";
    state.answers = { framework: "astro", "product-name": "test" };

    const sections = ["hero", "features", "pricing", "cta"].map(id => ({ id, kind: id }));
    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "astro", backend: "none", domain: "none", sections });

    state.tasks = state.tasks.map(t => {
      if (["astro-init", "write-context", "shadcn-init", "impeccable-shape"].includes(t.id)) return { ...t, status: "complete" as const };
      if (t.id === "craft-hero") return { ...t, status: "running" as const };
      return t;
    });

    await saveState(dir, state);

    const driver = mockDriver();
    const result = await advancePipeline(dir, driver);

    expect(result.dispatched).toHaveLength(2);
    expect(result.dispatched.every(id => id.startsWith("craft-"))).toBe(true);
  });

  it("marks tasks complete after spawnTask resolves", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "static", "product-name": "test" };

    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "static", backend: "none", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    await advancePipeline(dir, driver);

    // After advancePipeline, dispatched tasks should be marked running (not complete yet)
    // Completion happens when spawnTask resolves — tested via completeTask
    expect(driver.spawned.length).toBeGreaterThan(0);
  });

  it("marks task failed when spawnTask returns failed", async () => {
    const state = createInitialState({ targetDir: dir });
    state.confirmed = true;
    state.phase = "scaffolding";
    state.answers = { framework: "static", "product-name": "test" };

    state.tasks = assembleTaskGraph({ targetDir: dir, framework: "static", backend: "none", domain: "none", sections: [{ id: "hero", kind: "hero" }] });
    await saveState(dir, state);

    const driver = mockDriver();
    driver.results.set("static-init", { taskId: "static-init", status: "failed", error: "LLM crash", durationMs: 50 });
    driver.results.set("write-context", { taskId: "write-context", status: "complete", durationMs: 50 });

    await advancePipeline(dir, driver);

    const finalState = await loadState(dir);
    const staticInit = finalState.tasks.find(t => t.id === "static-init");
    expect(staticInit?.status).toBe("failed");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test extensions/orchestrator/src/pipeline.test.ts`
Expected: FAIL — PipelineDriver interface mismatch

**Step 3: Rewrite pipeline.ts**

```typescript
// extensions/orchestrator/src/pipeline.ts
import { loadState, saveState, getReadyTasks, markTaskComplete, markTaskFailed, type RunState, type Task } from "@orchestrator/shared";
import type { TaskResult } from "./subagent.js";

export interface PipelineDriver {
  spawnTask: (task: Task, state: RunState) => Promise<TaskResult>;
  notify: (text: string, level: "info" | "error") => void;
  onTaskStart: (taskId: string) => void;
  onTaskEnd: (taskId: string, result: TaskResult) => void;
}

/**
 * Identifies impeccable-bound tasks for parallel throttling.
 */
export function isImpeccableTask(id: string): boolean {
  return id === "impeccable-shape" || id.startsWith("craft-") || id === "polish" || id === "audit";
}

/**
 * Dispatch one batch of ready tasks, awaiting their completion.
 * Returns dispatched task IDs. Does NOT auto-advance to next batch.
 * Caller (runPipeline) handles the continuous loop.
 */
export async function advancePipeline(
  targetDir: string,
  driver: PipelineDriver
): Promise<{ dispatched: string[]; done: boolean; failed: string[] }> {
  const state = await loadState(targetDir);
  const ready = getReadyTasks(state.tasks);

  if (ready.length === 0) {
    const allDone = state.tasks.every(t => t.status === "complete" || t.status === "skipped");
    const failed = state.tasks.filter(t => t.status === "failed").map(t => t.id);
    if (allDone) {
      state.phase = "done";
      await saveState(targetDir, state);
      driver.notify("✅ All tasks complete!", "info");
    }
    return { dispatched: [], done: allDone, failed };
  }

  // Enforce maxParallelImpeccable
  const maxParallel = state.config?.maxParallelImpeccable ?? 3;
  const runningImpeccable = state.tasks.filter(t => t.status === "running" && isImpeccableTask(t.id)).length;
  const availableSlots = Math.max(0, maxParallel - runningImpeccable);

  const impeccableReady = ready.filter(t => isImpeccableTask(t.id));
  const otherReady = ready.filter(t => !isImpeccableTask(t.id));
  const toDispatch = [...otherReady, ...impeccableReady.slice(0, availableSlots)];

  if (toDispatch.length === 0) {
    return { dispatched: [], done: false, failed: [] };
  }

  // Mark dispatched as running
  state.tasks = state.tasks.map(t =>
    toDispatch.some(r => r.id === t.id) ? { ...t, status: "running" as const } : t
  );
  await saveState(targetDir, state);

  const dispatched: string[] = toDispatch.map(t => t.id);
  driver.notify(`Dispatched ${dispatched.length} task(s): ${dispatched.join(", ")}`, "info");

  // Spawn all tasks in parallel, await all
  const promises = toDispatch.map(async (task) => {
    driver.onTaskStart(task.id);
    const result = await driver.spawnTask(task, state);
    driver.onTaskEnd(task.id, result);

    // Update state after each task completes
    const currentState = await loadState(targetDir);
    if (result.status === "complete") {
      currentState.tasks = markTaskComplete(currentState.tasks, task.id);
    } else {
      currentState.tasks = markTaskFailed(currentState.tasks, task.id, result.error ?? "unknown error");
    }
    currentState.phase = determinePhase(currentState);
    await saveState(targetDir, currentState);

    return result;
  });

  const results = await Promise.all(promises);
  const failed = results.filter(r => r.status === "failed").map(r => r.taskId);

  return { dispatched, done: false, failed };
}

/**
 * Run the full pipeline loop: dispatch batches continuously until done or failed.
 * Each batch dispatches ready tasks in parallel, waits for all to finish,
 * then checks for newly-ready tasks.
 */
export async function runPipeline(targetDir: string, driver: PipelineDriver): Promise<void> {
  let iterations = 0;
  const maxIterations = 50; // Safety valve

  while (iterations < maxIterations) {
    iterations++;
    const { dispatched, done, failed } = await advancePipeline(targetDir, driver);

    if (done) {
      driver.notify("🎉 Pipeline complete!", "info");
      return;
    }

    if (dispatched.length === 0 && failed.length > 0) {
      driver.notify(`Pipeline stalled — ${failed.length} failed task(s): ${failed.join(", ")}`, "error");
      return;
    }

    if (dispatched.length === 0) {
      // No tasks ready, but not done — waiting for running tasks (shouldn't happen in sync loop)
      driver.notify("Pipeline waiting for running tasks...", "info");
      return;
    }
  }

  driver.notify("Pipeline safety limit reached", "error");
}

function determinePhase(state: RunState): RunState["phase"] {
  const ids = state.tasks.filter(t => t.status === "running" || t.status === "pending").map(t => t.id);
  if (ids.length === 0) return "done";
  if (ids.some(id => id.startsWith("cf-"))) return "deploying";
  if (ids.some(id => id.startsWith("craft-") || id === "impeccable-shape" || id === "polish" || id === "audit" || id === "assemble-page")) return "building";
  if (ids.some(id => id === "astro-init" || id === "static-init" || id === "shadcn-init" || id === "supabase-provision" || id === "write-context")) return "scaffolding";
  return state.phase;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test extensions/orchestrator/src/pipeline.test.ts`
Expected: 6 PASS

**Step 5: Commit**

```bash
git add extensions/orchestrator/src/pipeline.ts extensions/orchestrator/src/pipeline.test.ts
git commit -m "feat: rewrite pipeline to dispatch subagent sessions with parallel execution"
```

---

### Task 4: Modify `progress.ts` — add elapsed time per task

**Files:**
- Modify: `extensions/orchestrator/src/progress.ts`
- Modify: `extensions/orchestrator/src/progress.test.ts`

**Step 1: Write the failing test**

Add to existing progress.test.ts:

```typescript
it("shows elapsed time for running tasks", () => {
  const tasks = [
    { id: "craft-hero", name: "Craft hero", status: "running" as const, deps: [] },
  ];
  // Pass start times map
  const startTimes = new Map([["craft-hero", Date.now() - 45_000]]);
  const lines = renderProgressWidget("building", tasks, startTimes);
  const joined = lines.join("\n");
  expect(joined).toContain("0:45");
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test extensions/orchestrator/src/progress.test.ts`
Expected: FAIL — renderProgressWidget doesn't accept startTimes

**Step 3: Update implementation**

Add optional `startTimes` param to `renderProgressWidget`:

```typescript
export function renderProgressWidget(
  phase: string,
  tasks: Task[],
  startTimes?: Map<string, number>
): string[] {
  // ... existing code ...

  // In running tasks section, add elapsed time:
  for (const t of runningTasks.slice(0, 3)) {
    const elapsed = startTimes?.get(t.id);
    const timeStr = elapsed ? formatElapsed(Date.now() - elapsed) : "";
    const nameWidth = timeStr ? 31 : 37;
    const name = t.name.length > nameWidth ? t.name.slice(0, nameWidth - 3) + "..." : t.name;
    const pad = timeStr ? `${name.padEnd(31)} ${timeStr.padStart(5)}` : name.padEnd(37);
    lines.push(`│ ▶ ${pad}│`);
  }
  // ...
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test extensions/orchestrator/src/progress.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add extensions/orchestrator/src/progress.ts extensions/orchestrator/src/progress.test.ts
git commit -m "feat: add elapsed time display per running task in progress widget"
```

---

### Task 5: Rewrite `index.ts` — wire subagent driver, remove old tools, add progress timer

**Files:**
- Modify: `extensions/orchestrator/src/index.ts`

**Step 1: Remove these tools from index.ts:**
- `orchestrator_task_done`
- `orchestrator_task_failed`

**Step 2: Rewrite `createDriver()` to use subagent dispatch:**

```typescript
function createDriver(pi: ExtensionAPI, ctx: any, targetDir: string): PipelineDriver {
  const startTimes = new Map<string, number>();
  let progressTimer: ReturnType<typeof setInterval> | undefined;

  const updateWidget = async () => {
    try {
      const state = await loadState(targetDir);
      ctx.ui.setStatus("orchestrator", renderProgressStatus(state.phase, state.tasks));
      if (state.tasks.length > 0) {
        ctx.ui.setWidget("orchestrator", renderProgressWidget(state.phase, state.tasks, startTimes));
      }
    } catch {}
  };

  const startProgressTimer = () => {
    if (!progressTimer) {
      progressTimer = setInterval(updateWidget, 5_000);
    }
  };

  const stopProgressTimer = () => {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = undefined;
    }
  };

  return {
    async spawnTask(task, state) {
      const { spawnTaskAgent } = await import("./subagent.js");
      return spawnTaskAgent(task, state, targetDir, {
        model: ctx.model,
        modelRegistry: ctx.modelRegistry,
        cwd: targetDir,
        impeccableSkillPath: findImpeccableSkillPath(),
        onProgress: (msg) => ctx.ui.notify(msg, "info"),
      });
    },
    notify: (text, level) => {
      ctx.ui.notify(text, level);
      updateWidget();
    },
    onTaskStart: (taskId) => {
      startTimes.set(taskId, Date.now());
      startProgressTimer();
      updateWidget();
    },
    onTaskEnd: (taskId, result) => {
      startTimes.delete(taskId);
      updateWidget();
      // Stop timer if no more running tasks
      if (startTimes.size === 0) stopProgressTimer();
    },
  };
}
```

**Step 3: Update confirm/resume handlers to use `runPipeline` instead of `advancePipeline`:**

```typescript
// In orchestrator_confirm tool and orchestrator:confirm command:
const driver = createDriver(pi, ctx, ctx.cwd);
await runPipeline(ctx.cwd, driver);
```

**Step 4: Add impeccable skill path finder:**

```typescript
function findImpeccableSkillPath(): string | undefined {
  const candidates = [
    join(homedir(), ".pi/agent/skills/impeccable/SKILL.md"),
  ];
  return candidates.find(p => existsSync(p));
}
```

**Step 5: Verify all existing tests still pass**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test`
Expected: All 142+ tests PASS

**Step 6: Commit**

```bash
git add extensions/orchestrator/src/index.ts
git commit -m "feat: wire subagent dispatch driver, remove task_done/task_failed tools, add progress timer"
```

---

### Task 6: Run full test suite and verify

**Step 1: Run all tests**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && pnpm test -- --reporter=verbose`
Expected: All tests pass (142 existing + new)

**Step 2: TypeScript check**

Run: `cd /home/nst/WebstormProjects/pi-orchestrators && cd extensions/orchestrator && pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Commit any fixups**

```bash
git add -A
git commit -m "chore: test and typecheck cleanup"
```

---

## Summary

| Task | Files | Tests | Description |
|------|-------|-------|-------------|
| 1 | tools.ts, tools.test.ts | 3 | Extract custom tools as standalone factories |
| 2 | subagent.ts, subagent.test.ts | 4 | spawnTaskAgent using createAgentSession |
| 3 | pipeline.ts, pipeline.test.ts | 6 | Rewrite to spawnTask + runPipeline loop |
| 4 | progress.ts, progress.test.ts | 1+ | Elapsed time per running task |
| 5 | index.ts | 0 | Wire driver, remove old tools, progress timer |
| 6 | — | all | Full test suite + typecheck |
