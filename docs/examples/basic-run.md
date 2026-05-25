# Basic Run

## Start orchestration

```bash
/orchestrator:start ./design-system.png ./home.png
```

The orchestrator will:
1. Extract design tokens and page structure from both images
2. Ask ~8 questions to fill gaps (product name, tone, backend needs, etc.)
3. Show a confirmation summary
4. After you type `confirm`, run the entire pipeline seamlessly

## Check status

```bash
/orchestrator:status
```

## Resume after interruption

```bash
/orchestrator:resume
```

Re-verifies all completed tasks (checks files exist, MCP resources present), then continues from earliest pending task.

## With auto-heal

```bash
/orchestrator:start --auto-heal ./design-system.png ./home.png
```

On recoverable errors (TypeScript, ESLint), dispatches a debug subagent to fix before continuing. Hard-capped at 1 heal attempt per task.

## Retry a specific task

```bash
/orchestrator:retry-task craft-hero
```

Marks the task pending and re-runs from there.
