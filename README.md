# pi-orchestrators

A [pi](https://github.com/earendil-works/pi-coding-agent) extension + skill pack that turns **two reference images** (design system + page) into a **deployed Astro site on Cloudflare Workers** — backed by Supabase, styled with shadcn/ui, polished by impeccable.

## Installation

### Prerequisites

- Node.js ≥ 22
- [pnpm](https://pnpm.io/) ≥ 10
- [pi](https://github.com/earendil-works/pi-coding-agent) installed globally
- MCP servers configured: `cloudflare`, `shadcn`, `supabase`

### Install as pi skill pack

```bash
# Clone
git clone git@github.com:igun997/pi-orchestrator.git
cd pi-orchestrator

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Register extension + skills with pi
pi ext add ./extensions/orchestrator
pi skill add ./skills/orchestrator-extract
pi skill add ./skills/orchestrator-context
pi skill add ./skills/orchestrator-scaffold
pi skill add ./skills/orchestrator-build
pi skill add ./skills/orchestrator-deploy
pi skill add ./skills/impeccable
pi skill add ./skills/orchestrator-picsum
```

### Cursor compatibility (optional)

```bash
pnpm cursor:install          # project-level
pnpm cursor:install:global   # global ~/.cursor
```

Uninstall:

```bash
pnpm cursor:uninstall
pnpm cursor:uninstall:global
```

## Quick start

```bash
# Check MCP availability
/orchestrator:doctor

# Start a run with two images
/orchestrator:start <design-system.png> <page-design.png>

# Monitor progress
/orchestrator:status
```

## How it works

1. Provide two images: design system reference + page design
2. Vision model extracts structured specs (colors, typography, layout, sections)
3. Orchestrator asks ~8 gap-filling questions (product name, tone, backend needs, etc.)
4. User confirms → seamless mode: no more prompts
5. Scaffolds Astro + Cloudflare + shadcn + optional Supabase
6. Builds via `npx impeccable shape/craft/polish/audit`
7. Deploys to Cloudflare Workers

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Astro hybrid + `@astrojs/cloudflare` v13+ (Workers mode) |
| Islands | React + Tailwind CSS v4 |
| Components | shadcn/ui (via MCP) |
| Backend | Supabase (opt-in: none / contact-form / auth / cms) |
| Hosting | Cloudflare Workers + Static Assets (via MCP) |
| Vision | 9router `/v1/chat/completions` (gemini-2.5-pro) |
| Design polish | impeccable skill |

## Commands

| Command | Description |
|---------|-------------|
| `/orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>` | Start new run |
| `/orchestrator:status` | Show current phase + task progress |
| `/orchestrator:resume [run-id]` | Resume interrupted run |
| `/orchestrator:list` | List all past runs |
| `/orchestrator:reset [run-id]` | Wipe run state |
| `/orchestrator:retry-task <task-id>` | Re-run specific failed task |
| `/orchestrator:doctor` | Check MCP availability |

## Development

```bash
pnpm install
pnpm build         # build all packages
pnpm test          # run all tests
pnpm typecheck     # typecheck all packages
```

## Project structure

```
packages/shared/              # @orchestrator/shared — schemas, state, tasks, errors, retry
extensions/orchestrator/      # pi extension — commands, runner, verifier, auto-heal
skills/
  orchestrator-extract/       # vision → JSON specs + Q-batch
  orchestrator-context/       # JSON → PRODUCT.md + DESIGN.md
  orchestrator-scaffold/      # astro + supabase + shadcn
  orchestrator-build/         # impeccable craft loop
  orchestrator-deploy/        # cloudflare worker push
  orchestrator-picsum/        # placeholder image generation
  impeccable/                 # design polish skill
```

## Safety

- After confirm, no prompts unless failure classified non-transient
- Transient errors (429, timeout, 5xx) auto-retry 3× with exponential backoff
- Recoverable errors (tsc, eslint) stop unless `--auto-heal` flag set
- Fatal errors (invalid image, missing MCP, quota) always stop
- `--auto-heal` dispatches `sp-debug` subagent on recoverable errors (1 attempt per task)

## License

MIT
