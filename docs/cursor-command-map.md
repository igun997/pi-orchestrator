# Cursor command map

This guide maps pi extension commands to Cursor-native equivalents so users can run the same orchestration flow without confusion.

## Quick mapping

| pi command | Cursor-native equivalent |
|---|---|
| `/orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>` | Prompt the agent to start a new run using `pi-orchestrator-cursor` and `orchestrator-extract-cursor`, read both images, then write `.orchestrator/specs/design-system.json` and `.orchestrator/specs/page-spec.json` |
| `/orchestrator:confirm` | Prompt: "Confirm run and continue to scaffold/build/deploy using existing state in `.orchestrator/state.json`" |
| `/orchestrator:status` | Prompt: "Read `.orchestrator/state.json` and summarize current phase and task status" |
| `/orchestrator:resume [run-id]` | Prompt: "Resume orchestrator from `.orchestrator/state.json`, re-verify completed tasks, then continue pending tasks" |
| `/orchestrator:list` | Prompt: "List available runs from `~/.pi/orchestrator/runs` (or current run state if pi runs are unavailable in this environment)" |
| `/orchestrator:reset [run-id]` | Prompt: "Reset this run by removing `.orchestrator/` after confirmation" |
| `/orchestrator:retry-task <task-id>` | Prompt: "Set task `<task-id>` back to pending in `.orchestrator/state.json` and continue pipeline" |
| `/orchestrator:doctor` | Prompt: "Check required MCP readiness for `cloudflare`, `shadcn`, and `supabase` and show missing setup" |
| `/orchestrator:vision-config [--global] ...` | Prompt: "Show/set/reset vision config in `.orchestrator/vision.json` (project) or `~/.pi/orchestrator/vision.json` (global)" |

## Recommended Cursor flow

1. Install compatibility layer:
   - project: `pnpm cursor:install`
   - global: `pnpm cursor:install:global`
2. Start with extract phase:
   - use `orchestrator-extract-cursor`
   - keep outputs in `.orchestrator/specs/`
3. Confirm explicitly before scaffold/build/deploy.
4. Continue with build/deploy skills:
   - `orchestrator-build-cursor`
   - `orchestrator-deploy-cursor`
5. Keep phase contract intact:
   - `extracting -> questioning -> confirming -> scaffolding -> building -> deploying -> done`

## Notes

- If pi extension is active, keep using `/orchestrator:*` commands directly.
- If running in pure Cursor mode, use prompts + skills while preserving `.orchestrator/` state and file contracts.
- The flow guard hook (`orchestrator-flow-guard.mjs`) asks before risky deploy commands when `confirmed` is not set.
