---
name: orchestrator-build
description: Run impeccable shape/craft/polish/audit loop to build site sections from extracted specs.
---

# Orchestrator Build

Use during `building` phase of pi-orchestrators.

## Workflow

1. Load `.orchestrator/state.json` from target project.
2. Ensure PRODUCT.md and DESIGN.md exist (written by orchestrator-context).
3. Run `npx impeccable shape` for layout plan.
4. Run `npx impeccable craft` per section (parallel, max 3).
5. Assemble page from crafted sections.
6. Wire supabase client if backend != none.
7. Run `npx impeccable polish` then `npx impeccable audit`.

Never scaffold or deploy. This skill only builds.
