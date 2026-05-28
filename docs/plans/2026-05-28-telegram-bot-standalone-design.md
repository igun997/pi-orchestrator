# Pi Orchestrator Telegram Bot — Standalone Design

**Date:** 2026-05-28  
**Status:** Approved

## Summary

Standalone Telegram bot (self-hosted VPS/Docker) that runs pi orchestrator sessions via Telegram. Each user gets isolated workspaces with per-user memory context. Admin manages credentials and model availability via commands.

## Architecture

```
pi-orchestrator-bot/
├── src/
│   ├── entrypoint.ts          # CLI entry
│   ├── config.ts              # env config loader (minimal)
│   ├── bot.ts                 # grammy bot setup + command routing
│   ├── session/
│   │   ├── manager.ts         # per-user pi session lifecycle
│   │   ├── workspace.ts       # multi-workspace per user
│   │   └── memctx.ts          # pi-memctx auto-init per telegram ID
│   ├── commands/
│   │   ├── start.ts           # welcome + status
│   │   ├── allow.ts           # admin-only: add users
│   │   ├── workspace.ts       # list/switch/create workspaces
│   │   ├── new.ts             # start orchestrator run
│   │   ├── status.ts          # current session status
│   │   ├── model.ts           # inline keyboard model picker
│   │   ├── menu.ts            # interactive menu with all actions
│   │   ├── deploy.ts          # MCP → wrangler fallback
│   │   ├── sessions.ts        # list/switch sessions
│   │   └── setup.ts           # admin: provider/cloudflare credentials
│   ├── credentials/
│   │   ├── store.ts           # encrypted credential storage
│   │   ├── verify.ts          # test API keys before saving
│   │   └── models.ts          # model registry (enabled/disabled/default)
│   ├── deploy/
│   │   ├── mcp-deploy.ts      # try cloudflare MCP first
│   │   └── wrangler-deploy.ts # fallback: wrangler CLI + token
│   ├── persona.ts             # load persona from config
│   ├── transport.ts           # telegram message helpers
│   └── allowlist.ts           # persistent allowlist (admin + users)
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

## Environment (.env.example)

```env
# Boot essentials only
TELEGRAM_BOT_TOKEN=123456789:AAFf_your_token
TELEGRAM_ADMIN_ID=111111111
DATA_DIR=/data/pi-orchestrator

# Persona (global for all users)
PERSONA_NAME=Kira
PERSONA_PROMPT=You are Kira, a frontend specialist who builds beautiful sites. Keep responses concise. Use emoji sparingly.
```

## Data Directory Layout

```
/data/pi-orchestrator/
├── config/
│   ├── providers.enc.json    # encrypted API keys per provider
│   ├── models.json           # enabled models + default
│   └── deploy.enc.json       # cloudflare credentials
├── allowlist.json            # { admin: 111111111, users: [222222222, ...] }
├── users/
│   ├── 111111111/
│   │   ├── workspaces/
│   │   │   ├── my-site/      # project workspace
│   │   │   └── another-site/
│   │   ├── memory/           # pi-memctx pack (shared across workspaces)
│   │   └── sessions/         # pi session files
│   └── 222222222/
│       ├── workspaces/
│       ├── memory/
│       └── sessions/
```

## Commands

### All Users

| Command | Purpose |
|---------|---------|
| `/start` | Welcome + status |
| `/workspace` | List/switch/create workspaces (inline keyboard) |
| `/new` | Start new orchestrator run in current workspace |
| `/status` | Current session/workspace status |
| `/model` | Switch model (inline keyboard, admin-enabled models only) |
| `/menu` | Interactive menu with all actions |
| `/deploy` | Deploy current project to Workers |
| `/sessions` | List/switch pi sessions |

### Admin Only

| Command | Purpose |
|---------|---------|
| `/allow <user_id>` | Add user to allowlist |
| `/deny <user_id>` | Remove user from allowlist |
| `/setup provider <name> <api_key>` | Add AI provider (verifies first) |
| `/setup cloudflare <token> <account_id>` | Set deploy credentials (verifies first) |
| `/setup remove <provider>` | Remove a provider |
| `/models` | List all models with status |
| `/models enable <model>` | Enable model for users |
| `/models disable <model>` | Disable model |
| `/models default <model>` | Set default model |

## Credential Verification Flow

### Provider Setup

```
Admin: /setup provider anthropic sk-ant-xxx...

Bot: 🔄 Verifying anthropic credentials...
     [test API call: list models or minimal completion]

     ✅ Verified! anthropic enabled.
     Available models: claude-sonnet-4-20250514, claude-haiku-4-20250514
     
     Set default? [inline keyboard: model options]
```

Failure:
```
Bot: ❌ Verification failed: Invalid API key (401 Unauthorized)
     Credentials NOT saved. Try again with /setup provider anthropic <key>
```

### Cloudflare Setup

```
Admin: /setup cloudflare CF_TOKEN ACCOUNT_ID

Bot: 🔄 Verifying cloudflare access...
     [calls /accounts/{id}/workers/scripts]

     ✅ Verified! Cloudflare deploy enabled.
     Account: my-account (3 workers found)
```

### Supported Providers

| Provider | Verification Method |
|----------|-------------------|
| anthropic | `POST /v1/messages` (minimal) |
| openai | `GET /v1/models` |
| google | `GET /v1beta/models` |
| groq | `GET /openai/v1/models` |
| cloudflare | `GET /accounts/{id}/workers/scripts` |

## Session Management

### Per-User Isolation

- Each telegram ID gets `/{DATA_DIR}/users/{telegram_id}/`
- Pi sessions scoped to user's active workspace
- `AgentSession` created via pi SDK (`createAgentSessionFromServices`)
- Session files stored in `users/{id}/sessions/`

### Multi-Workspace

- User can have N workspaces under `users/{id}/workspaces/`
- `/workspace` shows inline keyboard to switch
- `/workspace new <name>` creates new workspace
- Active workspace tracked in `users/{id}/active-workspace.json`

### pi-memctx Auto-Init

- On session start, init memory pack at `users/{id}/memory/`
- Pack shared across all user's workspaces
- Remembers preferences, past decisions, project context

## Skills & Extensions Loaded Per Session

- `orchestrator-interview` — conversational site builder
- `orchestrator-extract` — vision extraction (when images provided)
- `orchestrator-context` — generate PRODUCT.md/DESIGN.md
- `orchestrator-scaffold` — Astro + shadcn + Supabase
- `orchestrator-build` — impeccable craft loop
- `orchestrator-deploy` — cloudflare push
- `impeccable` — design polish
- `motion-design` — animation principles
- `design-engineering` — UI craft
- `pi-memctx` — memory context (auto-init per user)

## Deploy Skill (MCP → Wrangler Fallback)

```
1. Check if cloudflare MCP is active in session
   → YES: use MCP tools (wrangler_deploy, etc.)
   → NO: continue to step 2

2. Check if cloudflare credentials exist in config/deploy.enc.json
   → YES: run `npx wrangler deploy` with CLOUDFLARE_API_TOKEN env
   → NO: prompt admin to run /setup cloudflare
```

## Persona

Global persona from env config. Injected as system prompt prefix for all sessions:

```
PERSONA_NAME=Kira
PERSONA_PROMPT=You are Kira, a frontend specialist who builds beautiful sites. Keep responses concise. Use emoji sparingly.
```

Language: auto-detect from user's message language. Respond in same language.

## Roles

- **Admin** (single, from `TELEGRAM_ADMIN_ID`): full access + `/allow`, `/deny`, `/setup`, `/models`
- **User** (from allowlist): can use all features except admin commands
- **Unknown**: rejected with "Not authorized" message

## Tech Stack

- **Runtime**: Node.js 22+
- **Telegram**: grammy + @grammyjs/auto-retry
- **Pi SDK**: @earendil-works/pi-coding-agent (createAgentSessionFromServices)
- **Encryption**: Node crypto (aes-256-gcm, key from bot token + admin ID)
- **Container**: Docker + docker-compose

## Docker

```yaml
# docker-compose.yml
services:
  orchestrator-bot:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/data/pi-orchestrator
```

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY dist/ ./dist/
CMD ["node", "dist/entrypoint.js"]
```

## Interactive Menu (/menu)

Inline keyboard layout:

```
┌─────────────────────────────┐
│ 🚀 New Site  │ 📂 Workspace │
│ 📊 Status    │ 🔄 Model     │
│ 🌐 Deploy    │ 💬 Sessions  │
│ ❓ Help      │              │
└─────────────────────────────┘
```

Admin sees extra row:
```
│ ⚙️ Setup     │ 👥 Users     │
```

## Conversation Flow (Natural Language)

User doesn't need commands. Natural language triggers skills:

```
User: I want to build a food delivery website

Bot: [orchestrator-interview skill activates]
     What language should the site content be in?
     Examples: English, Indonesian, Japanese, Arabic
```

Commands are shortcuts, not requirements. The bot responds to natural language and routes to appropriate skills.
