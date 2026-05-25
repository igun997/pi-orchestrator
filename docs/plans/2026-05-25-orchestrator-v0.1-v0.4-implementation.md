# pi-orchestrators v0.1-v0.4 Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build a pi extension + skill pack that accepts two reference images, extracts a site spec, asks gap-filling questions, scaffolds an Astro/Cloudflare/Supabase/shadcn project, builds it through impeccable, and deploys to Cloudflare Workers with resumable state.

**Architecture:** Monorepo pnpm workspace. Extension owns commands, MCP bootstrap, task runner, state, resume. Skills own phase-specific workflows and call scripts. Shared package owns schemas, state helpers, task DAG, verifiers, and error classification.

**Tech Stack:** TypeScript strict, pnpm workspaces, vitest, zod, typebox, pi extension API, 9router OpenAI-compatible vision calls, Astro, React, Tailwind v4, shadcn, Supabase MCP, Cloudflare MCP, `npx impeccable`.

---

## Global rules for executor

- Work task-by-task. Do not skip tests.
- Keep commits small. One commit per task unless task says otherwise.
- Prefer TDD: write failing test, run fail, implement, run pass.
- Do not call real cloudflare/supabase/9router in unit tests. Mock adapters.
- Do not store secrets in state, logs, or commits. State may store secret keys names, not values.
- Generated target Astro project lives in temp dirs during tests, never in repo root.
- Use `docs/plans/2026-05-25-orchestrator-design.md` as source spec.

## Milestones

- **v0.1:** workspace, shared schemas/state, extension skeleton, extract skill mockable pipeline, Q-batch + confirm.
- **v0.2:** scaffold: Astro init, shadcn init, optional Supabase templates, PRODUCT.md/DESIGN.md writer.
- **v0.3:** build: impeccable runner, section DAG, hash idempotency, local build/audit loop.
- **v0.4:** deploy: Cloudflare MCP adapter, resume re-verify, auto-heal hook, observability.

---

## Task 1: Initialize pnpm workspace and test tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

**Step 1: Write root config**

`package.json`:

```json
{
  "name": "pi-orchestrators",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "extensions/*"
  - "skills/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "extensions/**/*.test.ts", "skills/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true
  }
});
```

`.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
.orchestrator/
.DS_Store
```

**Step 2: Install deps**

Run:

```bash
pnpm install
```

Expected: lockfile created, no errors.

**Step 3: Verify empty test suite**

Run:

```bash
pnpm test
```

Expected: Vitest exits cleanly or reports no tests.

**Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .gitignore pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace"
```

---

## Task 2: Create shared package with schemas

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas.test.ts`

**Step 1: Write failing schema tests**

`packages/shared/src/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DesignSystemSchema, PageSpecSchema, RunStateSchema } from "./schemas.js";

describe("schemas", () => {
  it("validates design system tokens", () => {
    const parsed = DesignSystemSchema.parse({
      colors: {
        primary: "oklch(0.62 0.14 240)",
        secondary: "oklch(0.72 0.08 210)",
        accent: "oklch(0.68 0.18 35)",
        neutrals: ["oklch(0.98 0.01 240)", "oklch(0.2 0.01 240)"],
        semantic: { success: "oklch(0.68 0.12 145)", warn: "oklch(0.72 0.14 75)", error: "oklch(0.62 0.18 25)", info: "oklch(0.65 0.12 230)" }
      },
      typography: { fontFamilies: { display: "Inter", body: "Inter", mono: "JetBrains Mono" }, scale: ["1rem", "1.25rem"], weights: [400, 600, 700] },
      spacing: { unit: "4px", scale: ["4px", "8px", "16px"] },
      radii: ["8px"],
      shadows: ["0 8px 24px oklch(0.2 0.01 240 / 0.12)"],
      borders: ["1px solid oklch(0.85 0.01 240)"],
      components: [{ name: "Button", variants: ["primary"], states: ["hover", "disabled"] }]
    });
    expect(parsed.colors.primary).toContain("oklch");
  });

  it("validates page sections", () => {
    const parsed = PageSpecSchema.parse({
      meta: { inferredPageType: "landing" },
      layout: { grid: "12-column", breakpoints: ["640px", "1024px"], container: "max-w-7xl" },
      sections: [{ id: "hero", kind: "hero", order: 0, content: { headline: "Build faster" }, components: ["Button"], notes: ["large visual"] }]
    });
    expect(parsed.sections[0]?.id).toBe("hero");
  });

  it("rejects invalid run phase", () => {
    expect(() => RunStateSchema.parse({ runId: "r", phase: "wat", createdAt: new Date().toISOString(), inputs: {}, tasks: [] })).toThrow();
  });
});
```

**Step 2: Run test to verify fail**

Run:

```bash
pnpm test packages/shared/src/schemas.test.ts
```

Expected: FAIL because files/schemas missing.

**Step 3: Implement schemas**

`packages/shared/package.json`:

```json
{
  "name": "@orchestrator/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {}
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"]
}
```

`packages/shared/src/schemas.ts`:

```ts
import { z } from "zod";

export const OklchColorSchema = z.string().regex(/^oklch\(/, "color must be OKLCH");

export const DesignSystemSchema = z.object({
  colors: z.object({
    primary: OklchColorSchema,
    secondary: OklchColorSchema,
    accent: OklchColorSchema,
    neutrals: z.array(OklchColorSchema).min(1),
    semantic: z.object({
      success: OklchColorSchema,
      warn: OklchColorSchema,
      error: OklchColorSchema,
      info: OklchColorSchema
    })
  }),
  typography: z.object({
    fontFamilies: z.object({ display: z.string(), body: z.string(), mono: z.string() }),
    scale: z.array(z.string()).min(1),
    weights: z.array(z.number()).min(1)
  }),
  spacing: z.object({ unit: z.string(), scale: z.array(z.string()).min(1) }),
  radii: z.array(z.string()).default([]),
  shadows: z.array(z.string()).default([]),
  borders: z.array(z.string()).default([]),
  components: z.array(z.object({ name: z.string(), variants: z.array(z.string()).default([]), states: z.array(z.string()).default([]) })).default([])
});

export const PageSpecSchema = z.object({
  meta: z.object({ inferredPageType: z.enum(["landing", "dashboard", "docs", "product", "other"]) }),
  layout: z.object({ grid: z.string(), breakpoints: z.array(z.string()).default([]), container: z.string().default("max-w-7xl") }),
  sections: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.string(),
    order: z.number().int().nonnegative(),
    content: z.record(z.unknown()).default({}),
    components: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([])
  })).min(1)
});

export const TaskStatusSchema = z.enum(["pending", "running", "complete", "failed", "skipped"]);
export const PhaseSchema = z.enum(["idle", "extracting", "questioning", "confirming", "scaffolding", "building", "deploying", "done", "failed"]);

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: TaskStatusSchema,
  deps: z.array(z.string()).default([]),
  hash: z.string().optional(),
  logs: z.string().optional(),
  errorRef: z.string().optional()
});

export const RunStateSchema = z.object({
  runId: z.string(),
  createdAt: z.string(),
  phase: PhaseSchema,
  inputs: z.object({ designSystemImage: z.string().optional(), pageImage: z.string().optional() }),
  specs: z.object({ designSystem: z.string().optional(), page: z.string().optional() }).default({}),
  answers: z.record(z.unknown()).default({}),
  confirmed: z.boolean().default(false),
  tasks: z.array(TaskSchema),
  stack: z.record(z.unknown()).default({}),
  config: z.object({ autoHeal: z.boolean().default(false), maxParallelImpeccable: z.number().int().positive().default(3) }).default({}),
  deployment: z.object({ url: z.string().optional() }).default({})
});

export type DesignSystem = z.infer<typeof DesignSystemSchema>;
export type PageSpec = z.infer<typeof PageSpecSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
```

`packages/shared/src/index.ts`:

```ts
export * from "./schemas.js";
```

**Step 4: Run tests + typecheck**

Run:

```bash
pnpm test packages/shared/src/schemas.test.ts
pnpm --filter @orchestrator/shared typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared package.json pnpm-lock.yaml
git commit -m "feat: add shared schemas"
```

---

## Task 3: Add state persistence helpers

**Files:**
- Create: `packages/shared/src/state.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/state.test.ts`

**Step 1: Write failing tests**

`packages/shared/src/state.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialState, loadState, saveState, statePaths } from "./state.js";

describe("state", () => {
  it("creates expected paths", () => {
    const paths = statePaths("/tmp/site");
    expect(paths.root).toBe("/tmp/site/.orchestrator");
    expect(paths.state).toBe("/tmp/site/.orchestrator/state.json");
  });

  it("saves and loads state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-"));
    const state = createInitialState({ targetDir: dir, designSystemImage: "ds.png", pageImage: "page.png", autoHeal: true });
    await saveState(dir, state);
    const loaded = await loadState(dir);
    expect(loaded.runId).toBe(state.runId);
    expect(loaded.config.autoHeal).toBe(true);
    expect(await readFile(join(dir, ".orchestrator", "state.json"), "utf8")).toContain("designSystemImage");
  });
});
```

**Step 2: Run failing test**

```bash
pnpm test packages/shared/src/state.test.ts
```

Expected: FAIL missing module.

**Step 3: Implement state helpers**

`packages/shared/src/state.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { RunStateSchema, type RunState } from "./schemas.js";

export function statePaths(targetDir: string) {
  const root = join(targetDir, ".orchestrator");
  return {
    root,
    inputs: join(root, "inputs"),
    specs: join(root, "specs"),
    logs: join(root, "logs"),
    checkpoints: join(root, "checkpoints"),
    state: join(root, "state.json")
  };
}

export function createInitialState(args: { targetDir: string; designSystemImage?: string; pageImage?: string; autoHeal?: boolean }): RunState {
  return RunStateSchema.parse({
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    phase: "idle",
    inputs: { designSystemImage: args.designSystemImage, pageImage: args.pageImage },
    specs: {},
    answers: {},
    confirmed: false,
    tasks: [],
    stack: {},
    config: { autoHeal: args.autoHeal ?? false, maxParallelImpeccable: 3 },
    deployment: {}
  });
}

export async function ensureStateDirs(targetDir: string) {
  const paths = statePaths(targetDir);
  await Promise.all([paths.root, paths.inputs, paths.specs, paths.logs, paths.checkpoints].map((p) => mkdir(p, { recursive: true })));
}

export async function saveState(targetDir: string, state: RunState) {
  const parsed = RunStateSchema.parse(state);
  await ensureStateDirs(targetDir);
  await writeFile(statePaths(targetDir).state, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export async function loadState(targetDir: string): Promise<RunState> {
  const raw = await readFile(statePaths(targetDir).state, "utf8");
  return RunStateSchema.parse(JSON.parse(raw));
}
```

`packages/shared/src/index.ts` add:

```ts
export * from "./state.js";
```

**Step 4: Run tests**

```bash
pnpm test packages/shared/src/state.test.ts packages/shared/src/schemas.test.ts
pnpm --filter @orchestrator/shared typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/state.ts packages/shared/src/state.test.ts packages/shared/src/index.ts
git commit -m "feat: add orchestrator state persistence"
```

---

## Task 4: Add task DAG and error classifier

**Files:**
- Create: `packages/shared/src/tasks.ts`
- Create: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/tasks.test.ts`
- Test: `packages/shared/src/errors.test.ts`

**Step 1: Write failing tests**

`packages/shared/src/tasks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getReadyTasks, markTaskComplete } from "./tasks.js";

describe("task graph", () => {
  const tasks = [
    { id: "a", name: "A", status: "complete" as const, deps: [] },
    { id: "b", name: "B", status: "pending" as const, deps: ["a"] },
    { id: "c", name: "C", status: "pending" as const, deps: ["b"] }
  ];

  it("returns pending tasks whose deps are complete", () => {
    expect(getReadyTasks(tasks).map((t) => t.id)).toEqual(["b"]);
  });

  it("marks task complete immutably", () => {
    const next = markTaskComplete(tasks, "b");
    expect(next.find((t) => t.id === "b")?.status).toBe("complete");
    expect(tasks.find((t) => t.id === "b")?.status).toBe("pending");
  });
});
```

`packages/shared/src/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyError } from "./errors.js";

describe("classifyError", () => {
  it("classifies rate limits as transient", () => {
    expect(classifyError(new Error("429 Too Many Requests"))).toBe("transient");
  });

  it("classifies TypeScript failures as recoverable", () => {
    expect(classifyError(new Error("tsc exited with code 2"))).toBe("recoverable");
  });

  it("classifies invalid image as fatal", () => {
    expect(classifyError(new Error("invalid image: unsupported media type"))).toBe("fatal");
  });
});
```

**Step 2: Run failing tests**

```bash
pnpm test packages/shared/src/tasks.test.ts packages/shared/src/errors.test.ts
```

Expected: FAIL missing modules.

**Step 3: Implement**

`packages/shared/src/tasks.ts`:

```ts
import type { Task } from "./schemas.js";

export function getReadyTasks(tasks: Task[]): Task[] {
  const complete = new Set(tasks.filter((t) => t.status === "complete" || t.status === "skipped").map((t) => t.id));
  return tasks.filter((t) => t.status === "pending" && t.deps.every((dep) => complete.has(dep)));
}

export function markTaskComplete(tasks: Task[], id: string): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, status: "complete" } : t));
}

export function markTaskFailed(tasks: Task[], id: string, errorRef: string): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, status: "failed", errorRef } : t));
}

export function resetTask(tasks: Task[], id: string): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, status: "pending", errorRef: undefined } : t));
}
```

`packages/shared/src/errors.ts`:

```ts
export type ErrorClass = "transient" | "recoverable" | "fatal";

export function classifyError(error: unknown): ErrorClass {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  if (/\b(429|rate limit|timeout|timed out|econnreset|5\d\d|mcp not connected)\b/i.test(msg)) return "transient";
  if (lower.includes("invalid image") || lower.includes("unsupported media") || lower.includes("quota") || lower.includes("missing mcp")) return "fatal";
  if (lower.includes("tsc") || lower.includes("eslint") || lower.includes("broken import") || lower.includes("build failed")) return "recoverable";
  return "fatal";
}
```

`packages/shared/src/index.ts` add exports.

**Step 4: Run tests**

```bash
pnpm test packages/shared/src/tasks.test.ts packages/shared/src/errors.test.ts
pnpm --filter @orchestrator/shared typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/tasks.ts packages/shared/src/errors.ts packages/shared/src/*.test.ts packages/shared/src/index.ts
git commit -m "feat: add task graph helpers"
```

---

## Task 5: Create extension skeleton and command parser

**Files:**
- Create: `extensions/orchestrator/package.json`
- Create: `extensions/orchestrator/tsconfig.json`
- Create: `extensions/orchestrator/src/args.ts`
- Create: `extensions/orchestrator/src/index.ts`
- Test: `extensions/orchestrator/src/args.test.ts`

**Step 1: Write failing parser tests**

`extensions/orchestrator/src/args.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStartArgs } from "./args.js";

describe("parseStartArgs", () => {
  it("parses flags and image paths", () => {
    expect(parseStartArgs("--auto-heal --tui ds.png page.png")).toEqual({ autoHeal: true, tui: true, designSystemImage: "ds.png", pageImage: "page.png" });
  });

  it("throws when two images missing", () => {
    expect(() => parseStartArgs("ds.png")).toThrow("expected two image paths");
  });
});
```

**Step 2: Run failing test**

```bash
pnpm test extensions/orchestrator/src/args.test.ts
```

Expected: FAIL missing module.

**Step 3: Implement extension skeleton**

`extensions/orchestrator/package.json`:

```json
{
  "name": "@orchestrator/pi-extension",
  "version": "0.1.0",
  "type": "module",
  "pi": { "extensions": ["./src/index.ts"] },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@orchestrator/shared": "workspace:*",
    "@earendil-works/pi-coding-agent": "^0.0.0",
    "typebox": "^1.0.0"
  }
}
```

If `@earendil-works/pi-coding-agent` package version fails install, replace with local workspace-compatible dev dependency per pi docs or use type-only import path already installed globally during tests.

`extensions/orchestrator/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"]
}
```

`extensions/orchestrator/src/args.ts`:

```ts
export interface StartArgs {
  autoHeal: boolean;
  tui: boolean;
  designSystemImage: string;
  pageImage: string;
}

export function parseStartArgs(raw: string): StartArgs {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const autoHeal = parts.includes("--auto-heal");
  const tui = parts.includes("--tui");
  const images = parts.filter((p) => !p.startsWith("--"));
  if (images.length !== 2) throw new Error("expected two image paths: <design-system-image> <page-image>");
  return { autoHeal, tui, designSystemImage: images[0]!, pageImage: images[1]! };
}
```

`extensions/orchestrator/src/index.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseStartArgs } from "./args.js";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("orchestrator:start", {
    description: "Start image-to-site orchestration: /orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>",
    handler: async (args, ctx) => {
      const parsed = parseStartArgs(args ?? "");
      ctx.ui.notify(`Starting orchestrator for ${parsed.designSystemImage} + ${parsed.pageImage}`, "info");
    }
  });

  pi.registerCommand("orchestrator:status", { description: "Show orchestrator status", handler: async (_args, ctx) => ctx.ui.notify("No run loaded", "info") });
  pi.registerCommand("orchestrator:resume", { description: "Resume orchestrator run", handler: async (_args, ctx) => ctx.ui.notify("Resume not implemented yet", "info") });
  pi.registerCommand("orchestrator:list", { description: "List orchestrator runs", handler: async (_args, ctx) => ctx.ui.notify("List not implemented yet", "info") });
  pi.registerCommand("orchestrator:reset", { description: "Reset orchestrator run", handler: async (_args, ctx) => ctx.ui.notify("Reset not implemented yet", "info") });
  pi.registerCommand("orchestrator:retry-task", { description: "Retry orchestrator task", handler: async (_args, ctx) => ctx.ui.notify("Retry not implemented yet", "info") });
}
```

**Step 4: Run tests**

```bash
pnpm test extensions/orchestrator/src/args.test.ts
pnpm --filter @orchestrator/pi-extension typecheck
```

Expected: PASS or package version issue noted and fixed.

**Step 5: Commit**

```bash
git add extensions/orchestrator package.json pnpm-lock.yaml
git commit -m "feat: add orchestrator extension skeleton"
```

---

## Task 6: Implement run initialization and status/list commands

**Files:**
- Create: `extensions/orchestrator/src/runs.ts`
- Modify: `extensions/orchestrator/src/index.ts`
- Test: `extensions/orchestrator/src/runs.test.ts`

**Step 1: Write failing tests**

`extensions/orchestrator/src/runs.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRun, renderStatus } from "./runs.js";

describe("runs", () => {
  it("creates run state in target dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-run-"));
    const state = await createRun({ targetDir: dir, designSystemImage: "ds.png", pageImage: "page.png", autoHeal: false });
    expect(state.phase).toBe("extracting");
    expect(state.inputs.pageImage).toBe("page.png");
  });

  it("renders status", () => {
    expect(renderStatus({ runId: "r1", phase: "extracting", tasks: [], createdAt: "now", inputs: {}, specs: {}, answers: {}, confirmed: false, stack: {}, config: { autoHeal: false, maxParallelImpeccable: 3 }, deployment: {} })).toContain("extracting");
  });
});
```

**Step 2: Run fail**

```bash
pnpm test extensions/orchestrator/src/runs.test.ts
```

Expected: FAIL.

**Step 3: Implement**

`extensions/orchestrator/src/runs.ts`:

```ts
import { createInitialState, saveState, type RunState } from "@orchestrator/shared";

export async function createRun(args: { targetDir: string; designSystemImage: string; pageImage: string; autoHeal: boolean }): Promise<RunState> {
  const state = createInitialState(args);
  state.phase = "extracting";
  state.tasks = [
    { id: "extract-design-system", name: "Extract design system", status: "pending", deps: [] },
    { id: "extract-page", name: "Extract page", status: "pending", deps: [] },
    { id: "questions", name: "Ask gap questions", status: "pending", deps: ["extract-design-system", "extract-page"] },
    { id: "confirm", name: "Confirm plan", status: "pending", deps: ["questions"] }
  ];
  await saveState(args.targetDir, state);
  return state;
}

export function renderStatus(state: RunState): string {
  const done = state.tasks.filter((t) => t.status === "complete").length;
  return `Run ${state.runId}\nPhase: ${state.phase}\nTasks: ${done}/${state.tasks.length} complete`;
}
```

Modify `index.ts` start command to call `createRun({ targetDir: ctx.cwd, ... })`, notify status. Status command loads state via `loadState(ctx.cwd)` and prints `renderStatus`.

**Step 4: Run tests/typecheck**

```bash
pnpm test extensions/orchestrator/src/runs.test.ts
pnpm --filter @orchestrator/pi-extension typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add extensions/orchestrator/src/runs.ts extensions/orchestrator/src/runs.test.ts extensions/orchestrator/src/index.ts
git commit -m "feat: initialize orchestrator runs"
```

---

## Task 7: Add MCP bootstrap checker

**Files:**
- Create: `packages/shared/src/mcp-check.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/mcp-check.test.ts`
- Modify: `extensions/orchestrator/src/index.ts`

**Step 1: Write failing test**

`packages/shared/src/mcp-check.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findMissingMcps, renderMcpSnippet } from "./mcp-check.js";

describe("mcp-check", () => {
  it("finds missing servers", () => {
    expect(findMissingMcps(["cloudflare"], ["cloudflare", "shadcn", "supabase"])).toEqual(["shadcn", "supabase"]);
  });

  it("renders snippet", () => {
    const snippet = renderMcpSnippet(["cloudflare"]);
    expect(snippet).toContain("cloudflare");
    expect(snippet).toContain("mcpServers");
  });
});
```

**Step 2: Implement**

`packages/shared/src/mcp-check.ts`:

```ts
export const REQUIRED_MCPS = ["cloudflare", "shadcn", "supabase"] as const;
export type RequiredMcp = (typeof REQUIRED_MCPS)[number];

export function findMissingMcps(available: string[], required: readonly string[] = REQUIRED_MCPS): string[] {
  const set = new Set(available);
  return required.filter((name) => !set.has(name));
}

export function renderMcpSnippet(missing: string[]): string {
  const entries = Object.fromEntries(missing.map((name) => [name, { command: "<fill-command>", args: ["<fill-args>"] }]));
  return JSON.stringify({ mcpServers: entries }, null, 2);
}
```

Export from index.

Extension `session_start`: for v0.1 do not call real `mcp({})` from extension (tool not exposed to TS). Instead notify user to run `/orchestrator:doctor` next task. Register `orchestrator:doctor` command that prints required names and snippet. Real MCP probe lands v0.4 adapter.

**Step 3: Run**

```bash
pnpm test packages/shared/src/mcp-check.test.ts
pnpm --filter @orchestrator/shared typecheck
pnpm --filter @orchestrator/pi-extension typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/shared/src/mcp-check.ts packages/shared/src/mcp-check.test.ts packages/shared/src/index.ts extensions/orchestrator/src/index.ts
git commit -m "feat: add mcp bootstrap guidance"
```

---

## Task 8: Create orchestrator-extract skill skeleton

**Files:**
- Create: `skills/orchestrator-extract/SKILL.md`
- Create: `skills/orchestrator-extract/package.json`
- Create: `skills/orchestrator-extract/tsconfig.json`
- Create: `skills/orchestrator-extract/src/prompts.ts`
- Create: `skills/orchestrator-extract/src/index.ts`
- Test: `skills/orchestrator-extract/src/prompts.test.ts`

**Step 1: Write failing prompt tests**

`skills/orchestrator-extract/src/prompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { designSystemPrompt, pageSpecPrompt } from "./prompts.js";

describe("prompts", () => {
  it("mentions OKLCH and schema", () => {
    expect(designSystemPrompt()).toContain("OKLCH");
    expect(designSystemPrompt()).toContain("colors");
  });

  it("asks for ordered sections", () => {
    expect(pageSpecPrompt()).toContain("sections");
    expect(pageSpecPrompt()).toContain("order");
  });
});
```

**Step 2: Implement skill skeleton**

`skills/orchestrator-extract/SKILL.md`:

```md
---
name: orchestrator-extract
description: Extract design-system and page specs from two images, then ask gap-filling questions before site generation.
---

# Orchestrator Extract

Use during `extracting` and `questioning` phases of pi-orchestrators.

## Workflow

1. Load `.orchestrator/state.json` from target project.
2. Read `inputs.designSystemImage` and `inputs.pageImage`.
3. Run `pnpm --filter @orchestrator/extract extract -- <targetDir>`.
4. Ask generated questions one at a time.
5. Save answers to state and move phase to `confirming`.

Never scaffold, build, or deploy. This skill only extracts specs and collects answers.
```

`skills/orchestrator-extract/package.json`:

```json
{
  "name": "@orchestrator/extract",
  "version": "0.1.0",
  "type": "module",
  "bin": { "orchestrator-extract": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit",
    "extract": "tsx src/index.ts"
  },
  "dependencies": { "@orchestrator/shared": "workspace:*" }
}
```

`skills/orchestrator-extract/tsconfig.json` rootDir `src`, outDir `dist`.

`skills/orchestrator-extract/src/prompts.ts`:

```ts
export function designSystemPrompt(): string {
  return `Extract a design system from this image. Return JSON only matching DesignSystemSchema. Use OKLCH for every color. Include colors, typography, spacing, radii, shadows, borders, and visible components.`;
}

export function pageSpecPrompt(): string {
  return `Extract page structure from this image. Return JSON only matching PageSpecSchema. Include ordered sections with stable kebab-case ids, kind, order, content, components, and notes.`;
}
```

`skills/orchestrator-extract/src/index.ts` initially prints prompts and exits 0 for smoke.

**Step 3: Run**

```bash
pnpm test skills/orchestrator-extract/src/prompts.test.ts
pnpm --filter @orchestrator/extract typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add skills/orchestrator-extract
git commit -m "feat: add extract skill skeleton"
```

---

## Task 9: Implement vision client interface with mock mode

**Files:**
- Create: `skills/orchestrator-extract/src/vision.ts`
- Test: `skills/orchestrator-extract/src/vision.test.ts`

**Step 1: Write failing tests**

`vision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MockVisionClient } from "./vision.js";

describe("MockVisionClient", () => {
  it("returns design system and page spec fixtures", async () => {
    const client = new MockVisionClient();
    expect((await client.extractDesignSystem("ds.png")).colors.primary).toContain("oklch");
    expect((await client.extractPageSpec("page.png")).sections[0]?.id).toBe("hero");
  });
});
```

**Step 2: Implement**

`vision.ts`:

```ts
import type { DesignSystem, PageSpec } from "@orchestrator/shared";

export interface VisionClient {
  extractDesignSystem(imagePath: string): Promise<DesignSystem>;
  extractPageSpec(imagePath: string): Promise<PageSpec>;
}

export class MockVisionClient implements VisionClient {
  async extractDesignSystem(_imagePath: string): Promise<DesignSystem> {
    return {
      colors: { primary: "oklch(0.62 0.14 240)", secondary: "oklch(0.72 0.08 210)", accent: "oklch(0.68 0.18 35)", neutrals: ["oklch(0.98 0.01 240)"], semantic: { success: "oklch(0.68 0.12 145)", warn: "oklch(0.72 0.14 75)", error: "oklch(0.62 0.18 25)", info: "oklch(0.65 0.12 230)" } },
      typography: { fontFamilies: { display: "Inter", body: "Inter", mono: "JetBrains Mono" }, scale: ["1rem", "1.25rem"], weights: [400, 600, 700] },
      spacing: { unit: "4px", scale: ["4px", "8px", "16px"] },
      radii: ["8px"], shadows: [], borders: [], components: [{ name: "Button", variants: ["primary"], states: ["hover"] }]
    };
  }

  async extractPageSpec(_imagePath: string): Promise<PageSpec> {
    return { meta: { inferredPageType: "landing" }, layout: { grid: "12-column", breakpoints: ["640px", "1024px"], container: "max-w-7xl" }, sections: [{ id: "hero", kind: "hero", order: 0, content: { headline: "Build faster" }, components: ["Button"], notes: [] }] };
  }
}
```

**Step 3: Run**

```bash
pnpm test skills/orchestrator-extract/src/vision.test.ts
pnpm --filter @orchestrator/extract typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add skills/orchestrator-extract/src/vision.ts skills/orchestrator-extract/src/vision.test.ts
git commit -m "feat: add mockable vision client"
```

---

## Task 10: Implement extraction script writing spec files

**Files:**
- Modify: `skills/orchestrator-extract/src/index.ts`
- Test: `skills/orchestrator-extract/src/index.test.ts`

**Step 1: Write failing integration test**

`index.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialState, saveState } from "@orchestrator/shared";
import { runExtract } from "./index.js";
import { MockVisionClient } from "./vision.js";

describe("runExtract", () => {
  it("writes specs and advances to questioning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-extract-"));
    const state = createInitialState({ targetDir: dir, designSystemImage: "ds.png", pageImage: "page.png" });
    state.phase = "extracting";
    await saveState(dir, state);
    const next = await runExtract(dir, new MockVisionClient());
    expect(next.phase).toBe("questioning");
    expect(next.specs.designSystem).toBe(".orchestrator/specs/design-system.json");
    expect(await readFile(join(dir, ".orchestrator/specs/page-spec.json"), "utf8")).toContain("hero");
  });
});
```

**Step 2: Implement**

`index.ts` export `runExtract(targetDir, client)`:

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DesignSystemSchema, PageSpecSchema, loadState, saveState, statePaths } from "@orchestrator/shared";
import { MockVisionClient, type VisionClient } from "./vision.js";

export async function runExtract(targetDir: string, client: VisionClient = new MockVisionClient()) {
  const state = await loadState(targetDir);
  if (!state.inputs.designSystemImage || !state.inputs.pageImage) throw new Error("missing input images");
  const [designSystem, pageSpec] = await Promise.all([
    client.extractDesignSystem(state.inputs.designSystemImage),
    client.extractPageSpec(state.inputs.pageImage)
  ]);
  const ds = DesignSystemSchema.parse(designSystem);
  const page = PageSpecSchema.parse(pageSpec);
  const paths = statePaths(targetDir);
  await writeFile(join(paths.specs, "design-system.json"), `${JSON.stringify(ds, null, 2)}\n`, "utf8");
  await writeFile(join(paths.specs, "page-spec.json"), `${JSON.stringify(page, null, 2)}\n`, "utf8");
  state.specs = { designSystem: ".orchestrator/specs/design-system.json", page: ".orchestrator/specs/page-spec.json" };
  state.phase = "questioning";
  state.tasks = state.tasks.map((t) => t.id === "extract-design-system" || t.id === "extract-page" ? { ...t, status: "complete" } : t);
  await saveState(targetDir, state);
  return state;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targetDir = process.argv[2] ?? process.cwd();
  await runExtract(targetDir);
}
```

**Step 3: Run**

```bash
pnpm test skills/orchestrator-extract/src/index.test.ts
pnpm --filter @orchestrator/extract typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add skills/orchestrator-extract/src/index.ts skills/orchestrator-extract/src/index.test.ts
git commit -m "feat: write extracted site specs"
```

---

## Task 11: Generate question batch

**Files:**
- Create: `skills/orchestrator-extract/src/questions.ts`
- Test: `skills/orchestrator-extract/src/questions.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { generateQuestions } from "./questions.js";

describe("generateQuestions", () => {
  it("always includes core questions and caps at eight", () => {
    const questions = generateQuestions({ meta: { inferredPageType: "landing" }, layout: { grid: "12", breakpoints: [], container: "max" }, sections: [{ id: "hero", kind: "hero", order: 0, content: {}, components: [], notes: [] }] });
    expect(questions.map((q) => q.id)).toContain("product-name");
    expect(questions.map((q) => q.id)).toContain("backend-level");
    expect(questions.length).toBeLessThanOrEqual(8);
  });
});
```

**Step 2: Implement**

`questions.ts`:

```ts
import type { PageSpec } from "@orchestrator/shared";

export type Question = { id: string; text: string; kind: "open" | "choice" | "yesno"; choices?: string[] };

export function generateQuestions(pageSpec: PageSpec): Question[] {
  const q: Question[] = [
    { id: "product-name", text: "Product name + short tagline?", kind: "open" },
    { id: "target-users", text: "Target users in one sentence?", kind: "open" },
    { id: "tone", text: "Tone, 3 adjectives?", kind: "open" },
    { id: "anti-references", text: "Any anti-references, sites/styles to avoid?", kind: "open" },
    { id: "register", text: "Register?", kind: "choice", choices: ["brand", "product"] },
    { id: "backend-level", text: "Backend need?", kind: "choice", choices: ["none", "contact-form", "auth", "cms"] },
    { id: "domain", text: "Deploy to workers.dev or custom domain?", kind: "open" }
  ];
  if (pageSpec.sections.length === 1) q.push({ id: "extra-pages", text: "Any pages beyond delivered image, or just this page?", kind: "open" });
  return q.slice(0, 8);
}
```

**Step 3: Run**

```bash
pnpm test skills/orchestrator-extract/src/questions.test.ts
pnpm --filter @orchestrator/extract typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add skills/orchestrator-extract/src/questions.ts skills/orchestrator-extract/src/questions.test.ts
git commit -m "feat: generate gap questions"
```

---

## Task 12: Add confirm summary renderer

**Files:**
- Create: `skills/orchestrator-extract/src/summary.ts`
- Test: `skills/orchestrator-extract/src/summary.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderConfirmSummary } from "./summary.js";

describe("renderConfirmSummary", () => {
  it("includes backend and task count", () => {
    const text = renderConfirmSummary({ answers: { "backend-level": "contact-form" }, sectionCount: 3, taskCount: 12 });
    expect(text).toContain("contact-form");
    expect(text).toContain("3 sections");
    expect(text).toContain("12 tasks");
  });
});
```

**Step 2: Implement**

`summary.ts`:

```ts
export function renderConfirmSummary(args: { answers: Record<string, unknown>; sectionCount: number; taskCount: number }): string {
  return [
    "# Orchestrator confirmation",
    `Product: ${args.answers["product-name"] ?? "(unset)"}`,
    `Backend: ${args.answers["backend-level"] ?? "none"}`,
    `Build: ${args.sectionCount} sections`,
    `Task graph: ${args.taskCount} tasks`,
    "Type `confirm` to run seamless mode."
  ].join("\n");
}
```

**Step 3: Run**

```bash
pnpm test skills/orchestrator-extract/src/summary.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add skills/orchestrator-extract/src/summary.ts skills/orchestrator-extract/src/summary.test.ts
git commit -m "feat: render confirmation summary"
```

---

## Task 13: Create orchestrator-context skill and PRODUCT/DESIGN writer

**Files:**
- Create: `skills/orchestrator-context/SKILL.md`
- Create: `skills/orchestrator-context/package.json`
- Create: `skills/orchestrator-context/tsconfig.json`
- Create: `skills/orchestrator-context/src/write-context.ts`
- Test: `skills/orchestrator-context/src/write-context.test.ts`

**Step 1: Write failing test**

Test writes fixture state/specs, calls `writeContext(targetDir)`, asserts `PRODUCT.md` contains `register:` and `DESIGN.md` contains OKLCH.

**Step 2: Implement writer**

`write-context.ts` should:

- Load state.
- Load `.orchestrator/specs/design-system.json` + `page-spec.json`.
- Write `PRODUCT.md`:
  - Product Name
  - register: brand/product
  - Users
  - Product Purpose
  - Tone
  - Anti-references
- Write `DESIGN.md`:
  - Color tokens in OKLCH
  - Typography
  - Spacing/radii/shadows
  - Components inventory
  - Page sections

**Step 3: Run**

```bash
pnpm test skills/orchestrator-context/src/write-context.test.ts
pnpm --filter @orchestrator/context typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add skills/orchestrator-context
git commit -m "feat: write impeccable context files"
```

---

## Task 14: Add v0.2 scaffold skill skeleton

**Files:**
- Create: `skills/orchestrator-scaffold/SKILL.md`
- Create: `skills/orchestrator-scaffold/package.json`
- Create: `skills/orchestrator-scaffold/tsconfig.json`
- Create: `skills/orchestrator-scaffold/src/commands.ts`
- Test: `skills/orchestrator-scaffold/src/commands.test.ts`

**Step 1: Test command generation**

Assert `astroInitCommands("acme")` includes:

- `pnpm create astro@latest acme`
- `pnpm astro add cloudflare --yes`
- `pnpm astro add react --yes`
- `pnpm astro add tailwind --yes`

**Step 2: Implement pure command builder**

Do not execute shell yet. Return array of commands.

**Step 3: Run**

```bash
pnpm test skills/orchestrator-scaffold/src/commands.test.ts
pnpm --filter @orchestrator/scaffold typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add skills/orchestrator-scaffold
git commit -m "feat: add scaffold command builders"
```

---

## Task 15: Implement schema template generator

**Files:**
- Create: `skills/orchestrator-scaffold/src/supabase-templates.ts`
- Test: `skills/orchestrator-scaffold/src/supabase-templates.test.ts`

**Step 1: Tests**

- `none` returns empty string.
- `contact-form` contains `create table public.messages` and `with check (true)` policy.
- `auth` contains `profiles`.
- `cms` contains `pages`, `media`, `storage`.

**Step 2: Implement**

Return SQL strings only. No MCP calls.

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-scaffold/src/supabase-templates.test.ts
pnpm --filter @orchestrator/scaffold typecheck
git add skills/orchestrator-scaffold/src/supabase-templates.ts skills/orchestrator-scaffold/src/supabase-templates.test.ts
git commit -m "feat: add supabase schema templates"
```

---

## Task 16: Implement shadcn component mapper

**Files:**
- Create: `skills/orchestrator-scaffold/src/shadcn-map.ts`
- Test: `skills/orchestrator-scaffold/src/shadcn-map.test.ts`

**Step 1: Tests**

Components `Button`, `TextInput`, `Card` map to `button`, `input`, `card`. Unknown skipped.

**Step 2: Implement mapper**

Export `mapComponentsToShadcn(components)` returning unique registry names.

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-scaffold/src/shadcn-map.test.ts
pnpm --filter @orchestrator/scaffold typecheck
git add skills/orchestrator-scaffold/src/shadcn-map.ts skills/orchestrator-scaffold/src/shadcn-map.test.ts
git commit -m "feat: map detected components to shadcn"
```

---

## Task 17: Add scaffold task planner

**Files:**
- Create: `skills/orchestrator-scaffold/src/plan.ts`
- Test: `skills/orchestrator-scaffold/src/plan.test.ts`

**Step 1: Tests**

Given backend `none`, tasks = `astro-init`, `write-context`, `shadcn-init` (no supabase). Given `contact-form`, includes `supabase-provision`.

**Step 2: Implement**

Return `Task[]` with deps:

- `astro-init` no deps
- `write-context` no deps
- `supabase-provision` no deps if backend != none
- `shadcn-init` depends `astro-init`

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-scaffold/src/plan.test.ts
pnpm --filter @orchestrator/scaffold typecheck
git add skills/orchestrator-scaffold/src/plan.ts skills/orchestrator-scaffold/src/plan.test.ts
git commit -m "feat: plan scaffold tasks"
```

---

## Task 18: Add runner skeleton in extension

**Files:**
- Create: `extensions/orchestrator/src/runner.ts`
- Test: `extensions/orchestrator/src/runner.test.ts`

**Step 1: Tests**

Create three tasks `a` complete, `b` and `c` pending with deps. Mock executor records order. Assert ready tasks run; failed task classifies error.

**Step 2: Implement**

`runReadyTasks(state, executor)`:

- Get ready tasks.
- Mark running.
- `Promise.allSettled` execute.
- Mark complete/failed.
- Return next state.

Do not wire to commands yet.

**Step 3: Run + commit**

```bash
pnpm test extensions/orchestrator/src/runner.test.ts
pnpm --filter @orchestrator/pi-extension typecheck
git add extensions/orchestrator/src/runner.ts extensions/orchestrator/src/runner.test.ts
git commit -m "feat: add task runner skeleton"
```

---

## Task 19: Add v0.3 build skill skeleton and craft planner

**Files:**
- Create: `skills/orchestrator-build/SKILL.md`
- Create: `skills/orchestrator-build/package.json`
- Create: `skills/orchestrator-build/tsconfig.json`
- Create: `skills/orchestrator-build/src/plan.ts`
- Test: `skills/orchestrator-build/src/plan.test.ts`

**Step 1: Tests**

Given PageSpec with `hero`, `pricing`, plan contains:

- `impeccable-shape`
- `craft-hero` deps `impeccable-shape`
- `craft-pricing` deps `impeccable-shape`
- `assemble-page` deps both craft tasks
- `polish` deps assemble
- `audit` deps polish

**Step 2: Implement**

Return `Task[]` only.

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-build/src/plan.test.ts
pnpm --filter @orchestrator/build typecheck
git add skills/orchestrator-build
git commit -m "feat: plan impeccable build tasks"
```

---

## Task 20: Implement build command generation

**Files:**
- Create: `skills/orchestrator-build/src/commands.ts`
- Test: `skills/orchestrator-build/src/commands.test.ts`

**Step 1: Tests**

Assert generated commands include:

- `npx impeccable shape "site layout"`
- `npx impeccable craft "hero: hero"`
- `npx impeccable polish src/pages/index.astro`
- `npx impeccable audit src/pages/index.astro`

**Step 2: Implement**

Pure command generation, no shell execution.

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-build/src/commands.test.ts
pnpm --filter @orchestrator/build typecheck
git add skills/orchestrator-build/src/commands.ts skills/orchestrator-build/src/commands.test.ts
git commit -m "feat: generate impeccable commands"
```

---

## Task 21: Implement craft idempotency hash

**Files:**
- Create: `skills/orchestrator-build/src/hash.ts`
- Test: `skills/orchestrator-build/src/hash.test.ts`

**Step 1: Tests**

Same section+answers+design hash returns same value. Changed answers changes value.

**Step 2: Implement**

Use Node `crypto.createHash("sha256")` with stable JSON stringify.

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-build/src/hash.test.ts
pnpm --filter @orchestrator/build typecheck
git add skills/orchestrator-build/src/hash.ts skills/orchestrator-build/src/hash.test.ts
git commit -m "feat: hash craft task inputs"
```

---

## Task 22: Add page assembler

**Files:**
- Create: `skills/orchestrator-build/src/assemble.ts`
- Test: `skills/orchestrator-build/src/assemble.test.ts`

**Step 1: Tests**

Given sections `hero`, `pricing`, generated Astro page imports components and renders in order.

**Step 2: Implement**

Return string:

```astro
---
import Hero from "../components/hero.astro";
import Pricing from "../components/pricing.astro";
---
<main>
  <Hero />
  <Pricing />
</main>
```

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-build/src/assemble.test.ts
pnpm --filter @orchestrator/build typecheck
git add skills/orchestrator-build/src/assemble.ts skills/orchestrator-build/src/assemble.test.ts
git commit -m "feat: assemble astro page from sections"
```

---

## Task 23: Add Supabase client writer

**Files:**
- Create: `skills/orchestrator-build/src/supabase-client.ts`
- Test: `skills/orchestrator-build/src/supabase-client.test.ts`

**Step 1: Tests**

Generated `src/lib/supabase.ts` imports `createClient` and `Database` type, uses `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY`.

**Step 2: Implement**

Pure string generator + file writer function.

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-build/src/supabase-client.test.ts
pnpm --filter @orchestrator/build typecheck
git add skills/orchestrator-build/src/supabase-client.ts skills/orchestrator-build/src/supabase-client.test.ts
git commit -m "feat: generate supabase client"
```

---

## Task 24: Add v0.4 deploy skill skeleton

**Files:**
- Create: `skills/orchestrator-deploy/SKILL.md`
- Create: `skills/orchestrator-deploy/package.json`
- Create: `skills/orchestrator-deploy/tsconfig.json`
- Create: `skills/orchestrator-deploy/src/plan.ts`
- Test: `skills/orchestrator-deploy/src/plan.test.ts`

**Step 1: Tests**

Plan contains `cf-build`, `cf-worker-create`, `cf-secrets-push`, `cf-deploy`, optional `cf-domain-attach` when domain custom.

**Step 2: Implement**

Return `Task[]` with serial deps.

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-deploy/src/plan.test.ts
pnpm --filter @orchestrator/deploy typecheck
git add skills/orchestrator-deploy
git commit -m "feat: plan cloudflare deploy tasks"
```

---

## Task 25: Implement Cloudflare command adapter interface

**Files:**
- Create: `skills/orchestrator-deploy/src/cloudflare.ts`
- Test: `skills/orchestrator-deploy/src/cloudflare.test.ts`

**Step 1: Tests**

Mock adapter records calls for `ensureWorker`, `putSecrets`, `deploy`. Ensure `deploy` always executes.

**Step 2: Implement**

Define interface:

```ts
export interface CloudflareAdapter {
  hasWorker(name: string): Promise<boolean>;
  createWorker(name: string): Promise<void>;
  listSecretNames(name: string): Promise<string[]>;
  putSecret(name: string, key: string, value: string): Promise<void>;
  deploy(name: string, distDir: string): Promise<{ url: string }>;
}
```

Implement pure `ensureWorker`, `ensureSecrets`, `deployAlways` helpers. Real MCP adapter left TODO until tool names known.

**Step 3: Run + commit**

```bash
pnpm test skills/orchestrator-deploy/src/cloudflare.test.ts
pnpm --filter @orchestrator/deploy typecheck
git add skills/orchestrator-deploy/src/cloudflare.ts skills/orchestrator-deploy/src/cloudflare.test.ts
git commit -m "feat: add cloudflare deploy adapter interface"
```

---

## Task 26: Implement verifier for resume

**Files:**
- Create: `extensions/orchestrator/src/verifier.ts`
- Test: `extensions/orchestrator/src/verifier.test.ts`

**Step 1: Tests**

- Complete file task with missing file becomes pending.
- Complete file task with present file stays complete.
- Deploy task always pending.

**Step 2: Implement**

`verifyTasks(state, targetDir, checks)` accepts `checks.fileExists(path)` and optional MCP checks. Use task id conventions:

- `craft-*` expect `src/components/<id>.astro`
- `cf-deploy` always pending
- other complete tasks unchanged v0.4 unless check registered.

**Step 3: Run + commit**

```bash
pnpm test extensions/orchestrator/src/verifier.test.ts
pnpm --filter @orchestrator/pi-extension typecheck
git add extensions/orchestrator/src/verifier.ts extensions/orchestrator/src/verifier.test.ts
git commit -m "feat: re-verify tasks on resume"
```

---

## Task 27: Implement retry/backoff utility

**Files:**
- Create: `packages/shared/src/retry.ts`
- Test: `packages/shared/src/retry.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Tests**

Transient error retried 3 times then succeeds. Fatal error not retried.

**Step 2: Implement**

`retryClassified(fn, { retries, delayMs, classify })`. In tests use `delayMs: 0`.

**Step 3: Run + commit**

```bash
pnpm test packages/shared/src/retry.test.ts
pnpm --filter @orchestrator/shared typecheck
git add packages/shared/src/retry.ts packages/shared/src/retry.test.ts packages/shared/src/index.ts
git commit -m "feat: add classified retry helper"
```

---

## Task 28: Add auto-heal hook abstraction

**Files:**
- Create: `extensions/orchestrator/src/auto-heal.ts`
- Test: `extensions/orchestrator/src/auto-heal.test.ts`

**Step 1: Tests**

- When `autoHeal=false`, hook returns `skipped`.
- When task has already healed once, returns `skipped`.
- When enabled, calls provided `dispatchDebug` once.

**Step 2: Implement**

No real subagent in unit code. Interface:

```ts
export type DispatchDebug = (prompt: string) => Promise<void>;
export async function maybeAutoHeal(args): Promise<"healed"|"skipped">;
```

Prompt includes task id, errorRef, relevant files.

**Step 3: Run + commit**

```bash
pnpm test extensions/orchestrator/src/auto-heal.test.ts
pnpm --filter @orchestrator/pi-extension typecheck
git add extensions/orchestrator/src/auto-heal.ts extensions/orchestrator/src/auto-heal.test.ts
git commit -m "feat: add auto-heal hook"
```

---

## Task 29: Add logging utility

**Files:**
- Create: `packages/shared/src/logging.ts`
- Test: `packages/shared/src/logging.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Tests**

Writes `.orchestrator/logs/<task-id>.log`, returns relative `logs/<task-id>.log` errorRef.

**Step 2: Implement**

Append-only `writeTaskLog(targetDir, taskId, text)`, `errorRef(taskId, line?)`.

**Step 3: Run + commit**

```bash
pnpm test packages/shared/src/logging.test.ts
pnpm --filter @orchestrator/shared typecheck
git add packages/shared/src/logging.ts packages/shared/src/logging.test.ts packages/shared/src/index.ts
git commit -m "feat: add task logging utilities"
```

---

## Task 30: Wire extension resume/status/list/reset/retry commands

**Files:**
- Modify: `extensions/orchestrator/src/index.ts`
- Modify: `extensions/orchestrator/src/runs.ts`
- Test: `extensions/orchestrator/src/runs.test.ts`

**Step 1: Tests**

Add pure functions:

- `listRuns(homeDir)` reads `~/.pi/orchestrator/runs` summaries.
- `resetRun(targetDir)` removes `.orchestrator`.
- `retryTask(state, id)` marks task pending.

**Step 2: Implement commands**

Commands call pure helpers and notify. Destructive `reset` must call `ctx.ui.confirm` before delete.

**Step 3: Run + commit**

```bash
pnpm test extensions/orchestrator/src/runs.test.ts
pnpm --filter @orchestrator/pi-extension typecheck
git add extensions/orchestrator/src/index.ts extensions/orchestrator/src/runs.ts extensions/orchestrator/src/runs.test.ts
git commit -m "feat: wire orchestrator run commands"
```

---

## Task 31: Add end-to-end dry-run test

**Files:**
- Create: `tests/orchestrator-dry-run.test.ts` or `packages/shared/src/e2e-dry-run.test.ts`

**Step 1: Test**

Dry-run should:

1. Create temp target dir.
2. Create run.
3. Run extract with mock vision.
4. Generate questions.
5. Simulate answers + confirm.
6. Write PRODUCT.md/DESIGN.md.
7. Plan scaffold/build/deploy tasks.
8. Assert final task graph has expected ids.

No shell, no MCP, no network.

**Step 2: Implement minimum exports to make test pass**

Add barrel exports from skill packages as needed.

**Step 3: Run**

```bash
pnpm test tests/orchestrator-dry-run.test.ts
pnpm test
pnpm typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add tests packages skills extensions
git commit -m "test: add orchestrator dry run"
```

---

## Task 32: Add docs and examples

**Files:**
- Create: `README.md`
- Create: `docs/examples/basic-run.md`
- Create: `docs/examples/mcp-bootstrap.md`
- Create: `.env.example`

**Step 1: Write docs**

README must include:

- What pi-orchestrators does
- Required MCPs
- Commands
- v0.1-v0.4 scope
- Safety: no prompts after confirm; failures stop unless transient/auto-heal

`basic-run.md` includes:

```bash
/orchestrator:start ./design-system.png ./home.png
/orchestrator:status
/orchestrator:resume
```

**Step 2: Verify docs mention key commands**

Run:

```bash
grep -R "/orchestrator:start" README.md docs/examples/basic-run.md
grep -R "cloudflare" README.md docs/examples/mcp-bootstrap.md
```

Expected: matching lines.

**Step 3: Commit**

```bash
git add README.md docs/examples .env.example
git commit -m "docs: document orchestrator usage"
```

---

## Task 33: Final verification

**Files:**
- No new files unless fixes needed.

**Step 1: Run all checks**

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass.

**Step 2: Inspect git status**

```bash
git status --short
```

Expected: clean.

**Step 3: If failures**

Use `/skill:systematic-debugging`. Fix root cause, rerun full checks.

**Step 4: Completion commit if needed**

Only if verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: pass final verification"
```

---

## Handoff notes

- This plan intentionally leaves real MCP adapter method names behind interfaces until extension execution can inspect available MCP server tools.
- v0.1 can ship with mock vision client + schema pipeline. Real 9router HTTP client can be added after dry-run passes.
- Before implementing real 9router client, load `/skill:9router` and its relevant capability docs.
- Before implementing real TUI panel, read pi `docs/tui.md` completely.
- Before package publishing, read pi `docs/packages.md` completely.
