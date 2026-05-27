# Subagent Dispatch — Design

**Date:** 2026-05-27  
**Status:** Draft  
**Branch:** `feat/subagent-dispatch`

## Problem

Pipeline tasks dispatch via `pi.sendUserMessage(text, { deliverAs: "followUp" })` — same LLM conversation. This causes:

1. **Context bleed** — earlier task outputs (hundreds of lines HTML) pollute later tasks
2. **Model drift** — after 8k+ tokens of hero HTML, LLM "forgets" MODE RULES
3. **No isolation** — errors in one task affect reasoning for next
4. **No real parallelism** — followUp messages are sequential in one context

## Solution

Each pipeline task → isolated `createAgentSession()` from pi SDK. Parent orchestrator extension acts as supervisor.

```
Parent Extension (index.ts)
  ├── orchestrator:confirm / orchestrator:resume
  │     └── advancePipeline()
  │           ├── spawnTaskAgent("astro-init")   → createAgentSession() → isolated LLM
  │           ├── spawnTaskAgent("write-context") → createAgentSession() → isolated LLM
  │           └── (waits, then dispatches next batch)
  │
  └── Progress tracking via ctx.ui.setWidget / ctx.ui.setStatus
       (native pi TUI — no LLM output in parent conversation)
```

## Architecture

### New file: `subagent.ts`

Core function: `spawnTaskAgent(task, state, targetDir, options) → Promise<TaskResult>`

```typescript
interface SubagentOptions {
  model: Model;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  cwd: string;
  skills?: Skill[];              // impeccable for craft/polish/audit tasks
  customTools?: ToolDefinition[]; // merge_sections, hex_to_oklch
  onProgress?: (update: string) => void;
}

interface TaskResult {
  taskId: string;
  status: "complete" | "failed";
  error?: string;
  durationMs: number;
}
```

Each subagent session:
- `SessionManager.inMemory()` — no persistence (task is ephemeral)
- System prompt = `taskToPrompt(task, state, targetDir)` via `DefaultResourceLoader.systemPromptOverride`
- Tools: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls` + custom tools
- Model: inherited from parent session's current model
- Skills: impeccable injected for craft/polish/audit tasks
- CWD: same as parent (targetDir)

### Modified: `pipeline.ts`

Replace `PipelineDriver.sendMessage` with subagent dispatch:

```typescript
interface PipelineDriver {
  spawnTask: (task: Task, state: RunState) => Promise<TaskResult>;
  notify: (text: string, level: "info" | "error") => void;
  onTaskStart: (taskId: string) => void;
  onTaskEnd: (taskId: string, result: TaskResult) => void;
}
```

`advancePipeline` becomes async with actual parallel execution:
- Dispatches ready tasks as `Promise.all` (respecting maxParallelImpeccable)
- Each promise: spawn subagent → await completion → mark complete/failed → advance pipeline
- Parent loop: dispatch batch → await all → dispatch next batch → repeat

### Modified: `index.ts`

- Remove `orchestrator_task_done` tool (parent auto-detects completion)
- `createDriver()` now creates subagent sessions instead of sendUserMessage
- Progress widget updates via `ctx.ui.setWidget` / `ctx.ui.setStatus` on task start/end
- Parent conversation stays clean — only status updates, no task output

### Completion detection

Option A chosen: parent auto-completes when `session.prompt()` resolves.

```
session.prompt("Build the hero section...") 
  → subagent works (read files, write code, bash commands)
  → prompt resolves
  → parent marks task complete
  → parent updates widget
  → parent dispatches next batch
```

If prompt throws → parent marks task failed.

### Skill injection

Impeccable skill injected for these tasks:
- `impeccable-shape`
- `craft-*` (all section craft tasks)
- `polish`
- `audit`

Other tasks (scaffold, deploy) get no skills — just tools.

```typescript
const needsImpeccable = isImpeccableTask(task.id);
const skills = needsImpeccable ? [impeccableSkill] : [];
```

### Progress tracking (native pi TUI)

Widget (`ctx.ui.setWidget`):
```
┌─ Orchestrator ─────────────────────────┐
│ Phase: building                        │
│ [████████████▓▓▓░░░░░░░░░░░░░░░]  40% │
│ ✓ 4  ▶ 3  ○ 3  ✗ 0  / 10 total       │
│────────────────────────────────────────│
│ ▶ craft-hero          0:42             │
│ ▶ craft-features      0:31             │
│ ▶ craft-pricing       0:18             │
└────────────────────────────────────────┘
```

Status bar (`ctx.ui.setStatus`):
```
orchestrator: building [4/10 40%] ▶3
```

Updates fire on:
- Task start (mark running, update widget)
- Task end (mark complete/failed, update widget, dispatch next)
- Every ~5s while tasks running (update elapsed time)

### Parallel execution model

```
Batch 1: [astro-init, write-context]          ← no deps, non-impeccable, parallel
  ↓ both complete
Batch 2: [shadcn-init, impeccable-shape]      ← deps met, parallel
  ↓ both complete  
Batch 3: [craft-hero, craft-features, craft-pricing]  ← maxParallel=3
  ↓ 1 completes → slot opens
Batch 3b: [craft-cta]                         ← fills slot
  ↓ all complete
Batch 4: [assemble-page]
  ↓ complete
Batch 5: [polish]
  ↓ complete
Batch 6: [audit]
```

Not strict batches — continuous: whenever a task completes, check for newly-ready tasks and dispatch if slots available.

## Files to create/modify

| File | Action | Description |
|------|--------|-------------|
| `extensions/orchestrator/src/subagent.ts` | **Create** | `spawnTaskAgent()` using `createAgentSession` |
| `extensions/orchestrator/src/subagent.test.ts` | **Create** | Tests for subagent spawn, skill injection, error handling |
| `extensions/orchestrator/src/pipeline.ts` | **Modify** | Replace sendMessage with spawnTask, continuous dispatch loop |
| `extensions/orchestrator/src/pipeline.test.ts` | **Modify** | Update mock driver, test parallel dispatch |
| `extensions/orchestrator/src/index.ts` | **Modify** | Wire subagent driver, remove task_done tool, add timer for widget updates |
| `extensions/orchestrator/src/progress.ts` | **Modify** | Add elapsed time per task, timer-based refresh |

## What stays the same

- `executor.ts` — `taskToPrompt()` unchanged, generates prompts for subagents
- `verifier.ts` — unchanged, still verifies artifacts
- `assemble-graph.ts` — unchanged, still builds task DAG
- `schemas.ts` / `state.ts` / `tasks.ts` — unchanged
- All MODE RULES — still in prompts, still enforced per task

## Risks

1. **SDK import in extension** — extension imports `createAgentSession` from `@earendil-works/pi-coding-agent`. Same package, should work since it's the host.
2. **Memory** — multiple concurrent LLM sessions. Mitigated by maxParallelImpeccable (default 3).
3. **API rate limits** — 3 concurrent API calls. Most providers handle this. Can lower to 1 if needed.
4. **Tool availability** — subagent sessions need tools built for the correct cwd. `createAgentSession({ cwd, tools: [...] })` handles this.
5. **Impeccable skill discovery** — need hardcoded path or dynamic discovery. Use pi's standard skill path.
