---
name: orchestrator-build-cursor
description: Build orchestrator projects with the same shape/craft/polish/audit flow used by pi-orchestrator. Use during building phase only.
disable-model-invocation: true
---

# orchestrator-build-cursor

Mirror the pi build phase while using Cursor-native execution.

## Build contract

- Load `.orchestrator/state.json`.
- Ensure context files exist before craft.
- Build sections using the existing impeccable loop.
- Keep outputs and section assembly paths compatible with orchestrator pipeline expectations.

## Constraints

- Never run deploy steps in this phase.
- Never mutate extract/question answer keys.

Canonical process is defined in `skills/orchestrator-build/SKILL.md`.
