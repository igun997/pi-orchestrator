---
name: orchestrator-extract-cursor
description: Extract specs from two reference images and collect required answers before confirmation. Use for extracting/questioning phases in this repository.
disable-model-invocation: true
---

# orchestrator-extract-cursor

Mirror the pi extract flow exactly.

## Do

- Read both input images.
- Write `.orchestrator/specs/design-system.json`.
- Write `.orchestrator/specs/page-spec.json`.
- Ask required questions one by one.
- Save answers into `.orchestrator/state.json`.
- Stop and wait for explicit confirmation.

## Do not

- Do not scaffold, build, or deploy.
- Do not skip confirmation.

Canonical process is defined in `skills/orchestrator-extract/SKILL.md`.
