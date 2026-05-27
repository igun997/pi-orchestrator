---
name: pi-orchestrator-cursor
description: Keep Cursor-native orchestration aligned with pi-orchestrator phases and state files. Use when running image-to-site flow in this repository.
disable-model-invocation: true
---

# pi-orchestrator-cursor

Run the same flow contract used by the pi extension, but with Cursor-native subagents when useful.

## Required phase order

1. `extracting` -> write `.orchestrator/specs/design-system.json` and `.orchestrator/specs/page-spec.json`
2. `questioning` -> collect missing answers into `.orchestrator/state.json`
3. `confirming` -> require explicit user confirmation
4. `scaffolding` -> scaffold project files
5. `building` -> run shape/craft/polish/audit loop
6. `deploying` -> deploy only after `confirmed: true`

## Compatibility rules

- Keep state in `.orchestrator/state.json`.
- Do not rename task ids, phase names, or answer keys.
- If running parallel work, keep task output paths identical to the pi flow.
- Reuse existing orchestrator phase skills from `skills/`.

## Phase skill sources

- Extract: `skills/orchestrator-extract/SKILL.md`
- Context: `skills/orchestrator-context/SKILL.md`
- Scaffold: `skills/orchestrator-scaffold/SKILL.md`
- Build: `skills/orchestrator-build/SKILL.md`
- Deploy: `skills/orchestrator-deploy/SKILL.md`
