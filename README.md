# pi-orchestrators

A conversation-first website builder powered by [pi](https://github.com/earendil-works/pi-coding-agent). Talk to **Kira** on Telegram → she interviews you → builds an Astro or static HTML site → deploys to Cloudflare Workers. No code needed.

## Features

- 🗣️ **Conversation-first** — Kira asks questions, suggests theme presets, builds your site
- 🎨 **10 theme presets** — Glass, Brutalist, Neon, Organic, Corporate, Retro, Minimal, Bold, Pastel, Dark
- 🚀 **One-click deploy** — `/deploy` pushes to Cloudflare Workers
- 🐳 **Standalone Docker** — no host mounts, all config via Telegram commands
- 🔐 **Encrypted credentials** — AES-256-GCM, stored in Docker volume
- 🧠 **pi-memctx** — memory context across sessions
- 🌐 **pi-web-access** — fetch websites, search, code examples

## Quick Start (Docker)

```bash
# Clone
git clone git@github.com:igun997/pi-orchestrator.git
cd pi-orchestrator

# Create .env (see .env.example)
cp .env.example .env
# Edit .env with your Telegram bot token and admin ID

# Run
docker compose up -d
```

Then on Telegram:

1. `/start` — welcome message
2. `/setup provider google YOUR_API_KEY` — configure AI model
3. `/setup cloudflare CF_TOKEN ACCOUNT_ID` — configure deploy target
4. `/workspace new my-site` — create workspace
5. `/new` — start the interview
6. Answer Kira's questions (language, brand, purpose, tone, theme...)
7. `/confirm` — build the site
8. `/deploy` — push to Cloudflare Workers

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome & status |
| `/menu` | Interactive button menu |
| `/new` | Start new site (orchestrator interview) |
| `/confirm` | Confirm spec & start building |
| `/deploy` | Deploy to Cloudflare Workers |
| `/workspace new <name>` | Create workspace |
| `/workspace list` | List workspaces |
| `/workspace switch <name>` | Switch workspace |
| `/model <name>` | Switch AI model |
| `/status` | Current status (workspace, model, orchestrator phase) |
| `/reset` | Wipe orchestrator state & start fresh |
| `/stop` | Abort running session |
| `/setup provider <name> <key>` | Configure AI provider |
| `/setup cloudflare <token> <id>` | Configure Cloudflare deploy |
| `/setup remove <provider>` | Remove provider |
| `/allow <user_id>` | Allow user access (admin only) |
| `/deny <user_id>` | Revoke user access (admin only) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather |
| `TELEGRAM_ADMIN_ID` | ✅ | Your Telegram user ID |
| `DATA_DIR` | ✅ | Data directory (default: `/data/pi-orchestrator`) |
| `PERSONA_NAME` | ❌ | Bot persona name (default: `Kira`) |
| `PERSONA_PROMPT` | ❌ | Custom system prompt |
| `DEBUG` | ❌ | Enable verbose pi session logging |

## Installation (pi extension)

For local pi CLI usage (not Docker):

```bash
cd pi-orchestrator
pnpm install && pnpm build

# Install all packages into pi
pi install ./extensions/orchestrator
pi install ./skills/orchestrator-interview
pi install ./skills/orchestrator-extract
pi install ./skills/orchestrator-context
pi install ./skills/orchestrator-scaffold
pi install ./skills/orchestrator-build
pi install ./skills/orchestrator-deploy
pi install ./skills/orchestrator-picsum
pi install ./skills/impeccable
pi install ./skills/motion-design
pi install ./skills/design-engineering
```

### pi CLI Commands

| Command | Description |
|---------|-------------|
| `/orchestrator:doctor` | Check MCP availability |
| `/orchestrator:start` | Start new run |
| `/orchestrator:status` | Show phase + task progress |
| `/orchestrator:resume` | Resume interrupted run |
| `/orchestrator:reset` | Wipe run state |
| `/orchestrator:confirm` | Confirm & start pipeline |

## How It Works

1. `/new` → Kira asks ~8 questions (language, brand, purpose, tone, theme, framework, backend, domain)
2. Suggests matching theme presets (scored by tone + industry overlap)
3. User confirms → spec files saved to `.orchestrator/`
4. `/confirm` → builds site using design system + page spec
5. `/deploy` → `wrangler deploy` to Cloudflare Workers

## Stack

| Layer | Technology |
|-------|-----------|
| Bot | Grammy (Telegram) + pi AgentSession |
| Frontend | Astro or Static HTML + Tailwind CSS |
| Components | shadcn/ui (optional, via MCP) |
| Deploy | Cloudflare Workers (wrangler CLI) |
| Credentials | AES-256-GCM encrypted store |
| Extensions | pi-memctx, pi-web-access |
| Design polish | impeccable + motion-design + design-engineering skills |

## Project Structure

```
packages/
  shared/                     # @orchestrator/shared — schemas, state, tasks
  telegram-bot/               # Grammy bot + pi session integration
extensions/
  orchestrator/               # pi extension — commands, pipeline, auto-heal
skills/
  orchestrator-interview/     # conversation-first Q&A flow
  orchestrator-extract/       # vision → JSON specs
  orchestrator-context/       # JSON → PRODUCT.md + DESIGN.md
  orchestrator-scaffold/      # astro + shadcn setup
  orchestrator-build/         # impeccable craft loop
  orchestrator-deploy/        # cloudflare worker push
  orchestrator-picsum/        # placeholder images
  impeccable/                 # design polish
  motion-design/              # LottieFiles motion principles
  design-engineering/         # Emil Kowalski UI polish
```

## Development

```bash
pnpm install
pnpm build         # build all packages
pnpm test          # run all tests (178 tests)
pnpm typecheck     # typecheck all packages
```

## CI/CD

GitHub Actions on push to `master`:
- Build → Typecheck → Test
- Auto-tag alpha release on merge

## Safety

- Bash commands timeout after 120s by default
- Transient errors auto-retry 3× with exponential backoff
- `--auto-heal` dispatches debug subagent on recoverable errors
- No secrets committed — all credentials via Telegram `/setup`

## License

MIT
