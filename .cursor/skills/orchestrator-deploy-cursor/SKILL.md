---
name: orchestrator-deploy-cursor
description: Deploy orchestrator output with Cloudflare after confirmation, preserving pi-orchestrator deploy behavior.
disable-model-invocation: true
---

# orchestrator-deploy-cursor

Deploy only after the run is confirmed and build artifacts are ready.

## Deploy guardrails

- Require `.orchestrator/state.json` with `confirmed: true`.
- Use the same deploy sequence expected by pi-orchestrator.
- Keep worker/domain outputs consistent with current state file expectations.

## Constraints

- Never run extract/scaffold/build actions from this skill.

Canonical process is defined in `skills/orchestrator-deploy/SKILL.md`.
