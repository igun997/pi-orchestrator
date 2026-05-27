# pi-orchestrators

A pi extension + skill pack that turns **two reference images** (design system + page) into a **deployed Astro site on Cloudflare Workers**, backed by Supabase, styled with shadcn, polished by impeccable.

## How it works

1. User provides two images: design system reference + page design
2. Vision model extracts structured specs (colors, typography, layout, sections)
3. Orchestrator asks ~8 gap-filling questions (product name, tone, backend needs, etc.)
4. User confirms → seamless mode: no more prompts
5. Scaffolds Astro + Cloudflare + shadcn + optional Supabase
6. Builds via `npx impeccable shape/craft/polish/audit`
7. Deploys to Cloudflare Workers

## Stack

- **Frontend**: Astro hybrid + `@astrojs/cloudflare` v13+ (Workers mode)
- **Islands**: React + Tailwind v4
- **Components**: shadcn/ui (via MCP)
- **Backend**: Supabase (opt-in: none / contact-form / auth / cms)
- **Hosting**: Cloudflare Workers + Static Assets (via MCP)
- **Vision**: 9router `/v1/chat/completions` (gemini-2.5-pro)
- **Design polish**: impeccable skill

## Required MCPs

Before first run, ensure these MCP servers are configured:

- `cloudflare` — Workers/Pages deploy, DNS
- `shadcn` — component registry
- `supabase` — project create, schema, types

Run `/orchestrator:doctor` to check availability.

## Cursor compatibility (project + global)

This repo now includes a Cursor-compatible layer that keeps the same phase contract as pi:

- Project config: `.cursor/rules/`, `.cursor/hooks.json`, `.cursor/hooks/`, `.cursor/skills/`
- Global install target: `~/.cursor/rules/`, `~/.cursor/hooks.json`, `~/.cursor/hooks/`, `~/.cursor/skills/`
- Flow guard hook asks for confirmation when deploy commands run before `.orchestrator/state.json` has `confirmed: true`

Install commands:

```bash
node scripts/install-cursor-compat.mjs           # project only
node scripts/install-cursor-compat.mjs --global  # global ~/.cursor
node scripts/uninstall-cursor-compat.mjs --dry-run
node scripts/uninstall-cursor-compat.mjs
node scripts/uninstall-cursor-compat.mjs --global
```

## Commands

| Command | Description |
|---|---|
| `/orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>` | Start new run |
| `/orchestrator:status` | Show current phase + task progress |
| `/orchestrator:resume [run-id]` | Resume interrupted run (re-verifies tasks) |
| `/orchestrator:list` | List all past runs |
| `/orchestrator:reset [run-id]` | Wipe run state (confirms first) |
| `/orchestrator:retry-task <task-id>` | Re-run specific failed task |
| `/orchestrator:doctor` | Check MCP availability |

## Safety

- After `confirm`, no prompts unless failure classified non-transient
- Transient errors (429, timeout, 5xx) auto-retry 3x with exponential backoff
- Recoverable errors (tsc, eslint) stop unless `--auto-heal` flag set
- Fatal errors (invalid image, missing MCP, quota) always stop
- `--auto-heal` dispatches `sp-debug` subagent on recoverable errors (1 attempt per task)

## Development

```bash
pnpm install
pnpm test          # run all tests
pnpm typecheck     # typecheck all packages
pnpm build         # build all packages
pnpm cursor:install
pnpm cursor:install:global
pnpm cursor:uninstall
pnpm cursor:uninstall:global
```

## Project structure

```
packages/shared/       # @orchestrator/shared — schemas, state, tasks, errors, retry, logging
extensions/orchestrator/  # pi extension — commands, runner, verifier, auto-heal
skills/
  orchestrator-extract/   # vision → JSON specs + Q-batch
  orchestrator-context/   # JSON → PRODUCT.md + DESIGN.md
  orchestrator-scaffold/  # astro + supabase + shadcn
  orchestrator-build/     # impeccable craft loop
  orchestrator-deploy/    # cloudflare worker push
```

## Milestones

- **v0.1**: workspace, shared, extension, extract skill, Q-batch, confirm
- **v0.2**: scaffold (Astro, shadcn, Supabase templates, context writer)
- **v0.3**: build (impeccable runner, section DAG, hash idempotency)
- **v0.4**: deploy (CF adapter, resume re-verify, auto-heal, observability)
