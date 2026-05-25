# pi-orchestrators — Design Spec

**Date:** 2026-05-25
**Status:** Design approved (brainstorming complete)
**Next:** writing-plans → executing-plans

## Goal

A pi extension + skill pack that turns **two images** (design system + page) into a **deployed Astro site on Cloudflare Workers**, backed by Supabase, styled with shadcn, polished by impeccable. After confirmation of an extracted spec, the entire pipeline runs **seamlessly** with no further prompts.

## Stack (locked)

- **Frontend**: Astro v5+ hybrid (`output: 'server'`), `@astrojs/cloudflare` v13.1.6+ (Workers mode, default)
- **Islands**: React + Tailwind v4
- **Components**: shadcn/ui (via shadcn MCP)
- **Backend**: Supabase (via supabase MCP) — optional, opt-in
- **Hosting**: Cloudflare Workers + Static Assets (via cloudflare MCP)
- **Vision**: 9router `/v1/chat/completions` with structured JSON output (gemini-2.5-pro default)
- **Design polish**: impeccable skill (already installed, invoked via `npx impeccable`)
- **Package manager**: pnpm
- **TS**: strict

## Repository Layout

```
pi-orchestrators/                    # pnpm workspace root
├── package.json                     # workspaces: extensions/*, skills/*, packages/*
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   └── shared/                      # @orchestrator/shared
│       ├── src/
│       │   ├── schemas.ts           # zod: DesignSystem, PageSpec, State, Task
│       │   ├── state.ts             # load/save .orchestrator/state.json
│       │   ├── tasks.ts             # task graph types + dep resolver
│       │   └── mcp-check.ts         # MCP availability probes
│       └── package.json
├── extensions/
│   └── orchestrator/                # pi extension
│       ├── extension.json
│       ├── src/
│       │   ├── activate.ts          # MCP bootstrap, registers commands
│       │   ├── commands/{start,resume,status,list,reset,retry-task}.ts
│       │   ├── runner.ts            # task graph executor (parallel where deps allow)
│       │   ├── verifier.ts          # resume re-verify per task type
│       │   └── tui/status-panel.ts  # live task progress (opt-in)
│       └── package.json
├── skills/
│   ├── orchestrator-extract/        # vision → JSON specs + Q-batch
│   ├── orchestrator-context/        # JSON → PRODUCT.md + DESIGN.md
│   ├── orchestrator-scaffold/       # astro + supabase + shadcn
│   ├── orchestrator-build/          # impeccable craft loop
│   └── orchestrator-deploy/         # cloudflare worker push
└── docs/plans/                      # generated build plans per run
```

Each skill = `SKILL.md` + `scripts/*.mjs` + `reference/*.md`. Extension is the only stateful piece. Skills are pure: read state, do work, write state.

## State Machine

```
idle → extracting → questioning → confirming
  → scaffolding → building → deploying → done
                                       ↓
                                    failed (any phase)
```

State file: `.orchestrator/state.json` in target project (active state) + `~/.pi/orchestrator/runs/<id>/` (history index).

```json
{
  "runId": "uuid",
  "createdAt": "iso",
  "phase": "extracting|questioning|...|done|failed",
  "inputs": { "designSystemImage": "path", "pageImage": "path" },
  "specs": { "designSystem": "...path", "page": "...path" },
  "answers": { ... },
  "tasks": [{ "id", "name", "status", "deps", "hash", "logs", "errorRef" }],
  "stack": { "astro": "...", "supabase": {...}, "cloudflare": {...} },
  "config": { "autoHeal": false, "maxParallelImpeccable": 3 },
  "deployment": { "url": "..." }
}
```

State transitions are extension-controlled. Skills request advance via `state.advance(phase)`; extension validates predecessor done, persists, broadcasts to TUI.

## Phase Detail

### `extracting` + `questioning` (skill: `orchestrator-extract`)

**Vision call** — two parallel 9router calls with `response_format: json_schema`:

- DS image → `DesignSystemSchema` → `specs/design-system.json`
- Page image → `PageSpecSchema` → `specs/page-spec.json`

**Zod schemas** (`@orchestrator/shared/schemas.ts`):

```ts
DesignSystemSchema = {
  colors: { primary, secondary, accent, neutrals[],
            semantic{success,warn,error,info} },  // OKLCH only
  typography: { fontFamilies{display,body,mono}, scale[], weights[] },
  spacing: { unit, scale[] },
  radii: [], shadows: [], borders: [],
  components: [{ name, variants[], states[] }]
}

PageSpecSchema = {
  meta: { inferredPageType: "landing"|"dashboard"|"docs"|"product"|"other" },
  layout: { grid, breakpoints, container },
  sections: [{ id, kind, order, content{}, components[], notes }]
}
```

**Question batch** — gap-driven, 8 max, one-at-a-time, multiple-choice preferred:

| Q | Trigger | Type |
|---|---|---|
| Product name + tagline | always | open |
| Target users | always | open |
| Tone (3 adjectives) | always | open |
| Anti-references | always | open |
| Register | impeccable needs | brand / product |
| Backend level | always | none / contact-form / auth / cms |
| Real content vs lorem | sections have lorem | yes / no |
| Domain | deploy phase | workers.dev / custom |
| Pages beyond delivered | only 1 page extracted | list / "just this" |
| Auto-heal toggle | flag not set | yes / no |

**Confirm** — render summary table, single user `confirm` flips `confirmed:true`. From here, no prompts unless failure classified non-transient.

### `scaffolding` (skill: `orchestrator-scaffold`)

Pure shell + MCP, no LLM. Parallel scripts:

```
scripts/
  astro-init.mjs        # pnpm create astro + add cloudflare/react/tailwind
  supabase-provision.mjs # supabase MCP: create project, apply schema template
  shadcn-init.mjs       # pnpm dlx shadcn init + add components from spec
  write-context.mjs     # specs + answers → PRODUCT.md + DESIGN.md
```

**Parallelism rules**:

- `astro-init` (no deps)
- `supabase-provision` (no deps, only if `answers.backend != "none"`)
- `shadcn-init` (depends: astro-init)
- `write-context` (depends: extract done)

Runner walks DAG; ready tasks dispatched together via `Promise.all`.

**`astro-init.mjs`** sequence:

```bash
pnpm create astro@latest <slug> --template minimal --typescript strict --install --no-git --skip-houston
cd <slug>
pnpm astro add cloudflare --yes        # v13+, Workers mode default
pnpm astro add react --yes
pnpm astro add tailwind --yes          # v4
git init && git add -A && git commit -m "chore: scaffold"
```

Patches `astro.config.mjs`: `output: 'server'`, adapter cloudflare, smart placement on.

**Supabase schema templates** (orchestrator-owned):

- `none` → no-op
- `contact-form` → `messages` table + RLS insert-only
- `auth` → supabase auth + `profiles` + trigger
- `cms` → `pages` + `media` + storage bucket + admin role

After provision: gen types → `src/types/db.ts`, write `.env`.

**`shadcn-init.mjs`**: maps `design-system.json.components[]` → shadcn registry names, adds via MCP. Theme tokens overridden by DESIGN.md output of `write-context.mjs`.

**`write-context.mjs`** is **the** handoff to impeccable. Format matches `load-context.mjs` expectations exactly (sections, register field, OKLCH colors).

### `building` (skill: `orchestrator-build`)

All LLM-heavy work delegated to `npx impeccable`. Skill = orchestration + checkpointing only.

**Pre-flight** (once):

```bash
cd <project-root>
node $IMPECCABLE_SCRIPTS/load-context.mjs   # warms PRODUCT.md + DESIGN.md
```

Loader failure → fatal abort (`write-context.mjs` broken upstream).

**Task graph**:

```
shape-task           : npx impeccable shape "site layout" --plan-out=.orchestrator/shape-plan.md
                       blocks all craft-task-*

craft-task-{section} : per page-spec.json sections[]
                       parallel: max 3 concurrent
                       npx impeccable craft "<section.id>: <section.kind>" \
                         --spec=.orchestrator/specs/page-spec.json#sections[<i>] \
                         --target=src/components/<section.id>.astro

wire-supabase-task   : if backend != none — gen src/lib/supabase.ts from types,
                       wire forms/auth components to client (templated, no LLM)
                       parallel with craft

assemble-page-task   : compose src/pages/index.astro from crafted sections
                       depends: all craft-task-*

polish-task          : npx impeccable polish src/pages/index.astro
                       depends: assemble + wire-supabase

audit-task           : npx impeccable audit src/pages/index.astro
                       depends: polish
                       a11y/perf failures → re-run polish once → still fail → fatal stop
```

**Idempotency**: per craft-task hash = `sha256(section_json + answers_json + DESIGN.md_hash)`. Resume re-checks → unchanged + file exists → skip.

**Concurrency cap**: 3 parallel impeccable invocations max (LLM context budget shared). Configurable via `state.config.maxParallelImpeccable`.

**Auto-heal** (flag from `--auto-heal`): on craft fail or audit non-recoverable, dispatch `sp-debug` subagent with task + error + files. Hard-cap 1 heal per task.

### `deploying` (skill: `orchestrator-deploy`)

Pure cloudflare MCP, no LLM. Serial, all idempotent via re-verify:

```
cf-build-task        : pnpm build (astro → dist/_worker.js + assets)
                       verify: dist/ exists, _worker.js present

cf-worker-create     : mcp.cloudflare.create_worker({ name: <slug> })
                       re-verify: list_workers → skip if exists

cf-secrets-push      : for each (key,val) in .env (SUPABASE_URL, SUPABASE_ANON_KEY):
                         mcp.cloudflare.put_secret(...)
                       re-verify: list_secrets keys match → skip

cf-deploy            : mcp.cloudflare.deploy({ name:<slug>, source:'dist/' })
                       always re-run (cheap)
                       output: deployment URL → state.deployment.url

cf-domain-attach     : if answers.domain != "workers.dev":
                         mcp.cloudflare.add_route(...)
                         mcp.cloudflare.dns_create(...)  // if zone managed
                       re-verify: existing route → skip
```

On `done`: print summary card (URL, supabase ref, repo path, run-id) + write `~/.pi/orchestrator/runs/<id>/summary.json`.

## Extension Commands

| Command | Action |
|---|---|
| `/orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>` | New run, write inputs, advance to `extracting` |
| `/orchestrator:resume [run-id]` | Load state, re-verify, continue |
| `/orchestrator:status` | Print phase + task graph + progress |
| `/orchestrator:list` | Show all runs from `~/.pi/orchestrator/runs/` |
| `/orchestrator:reset [run-id]` | Wipe `.orchestrator/` (confirm prompt) |
| `/orchestrator:retry-task <task-id>` | Mark task pending, re-run from there |

Image input via either CLI args (this command) or chat-supplied paths (extension picks up, stages into `.orchestrator/inputs/`).

## MCP Bootstrap

On first `activate()`:

```
mcp({}) → check cloudflare/shadcn/supabase present
missing → print exact mcp.json snippet → ask "add now?"
       → user pastes → mcp({ connect: ... }) → re-check
all present → ready
```

Hard fail with help; never silently skip.

## Failure Handling

Default mode (Q13):

- **Transient** (network timeout, 429, 5xx, MCP not connected) → retry with exponential backoff, 3x
- **Recoverable** (tsc, eslint, broken import) → stop, classified-recoverable error
- **Fatal** (invalid image, missing MCP after bootstrap, supabase quota) → stop, classified-fatal error

Auto-heal flag enables `sp-debug` subagent on recoverable errors, 1 attempt per task.

## Resume Semantics (Q12)

`/orchestrator:resume <id>` runs `verifier.ts`:

- **scaffold tasks**: file/dir presence checks → re-mark pending if missing
- **MCP tasks**: query MCP for resource by name → skip if exists, else pending
- **build tasks**: hash match + file present → skip, else pending
- **deploy**: always pending (cheap, idempotent CF deploy)

Then runner picks up from earliest pending.

## Observability

- Every task writes to `.orchestrator/logs/<task-id>.log`
- State file stays lean (no log inlining)
- Failed tasks: `errorRef: "logs/<id>.log:<line>"` for fast diag
- Optional TUI panel (`--tui`): live task graph, status icons, last log line per task, phase header — falls back to plain text if TUI unavailable

## Dependencies on Existing Skills

- **impeccable** (Anthropic-derived, Apache 2.0, installed at `/home/nst/.pi/agent/skills/impeccable/`) — invoked via `Bash(npx impeccable shape|craft|polish|audit ...)`
- **superpowers** (`coctostan/pi-superpowers`) — `writing-plans`, `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `sp-debug` (for auto-heal)
- **9router** (`igun997/pi-9router`) — vision calls via `9router-image` cousin pattern, here using `/v1/chat/completions`
- **Atlassian / Linear** MCPs — out of scope for v1, but extension commands could be re-used to file issues on failure (future)

## Decisions Log (from brainstorming)

| Q | Choice |
|---|---|
| Q1 Scope split | B — extension + multiple skills |
| Q2 Image ingestion | D — CLI command + chat paths |
| Q3 Vision model | A — 9router |
| Q4 Output schema | A — two JSON files |
| Q5 Impeccable plug-in | C — extract → context → shape → craft → polish → audit |
| Q6 Question phase | A — single batch after extract |
| Q7 Execution model | C with B as state layer |
| Q8 MCP setup | A + B — hard check + bootstrap snippet |
| Q9 Astro stack | B — hybrid + React + Tailwind v4 + pnpm |
| Q10 Repo layout | A — pnpm workspace |
| Q11 State storage | C — local + global index |
| Q12 Resume | B — re-verify each task |
| Q13 Failures | C default + D opt-in |
| Q14 Deploy | B — Workers (Static Assets) |
| Q15 Supabase | B — opt-in via Q-batch |

## Out of Scope (v1)

- Multi-page sites beyond user-listed pages
- Image generation (orchestrator only consumes images)
- A/B variants beyond `impeccable live`
- Cron / Durable Objects / R2 (CF beyond Workers + DNS)
- CMS UI
- Self-update / auto-pull skills

## Next Steps

1. `/skill:writing-plans` — produce concrete implementation plan with task ordering
2. `/skill:using-git-worktrees` — isolate impl branch
3. `/skill:executing-plans` — drive build with checkpoints
4. v0.1 milestone: scaffold + extract + Q-batch + confirm working end-to-end (no build/deploy yet)
5. v0.2: scaffold + build (impeccable) on local
6. v0.3: deploy via CF MCP
7. v0.4: resume + auto-heal
