# Pi Orchestrator — Getting Started Guide

A step-by-step guide to deploy your own AI website builder bot on Telegram.

---

## Prerequisites

- Docker & Docker Compose installed
- A Telegram account
- A Google AI API key (or Anthropic/OpenAI/Groq)
- Optional: Cloudflare account (for deploying sites)

---

## Step 1: Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name (e.g. "My Site Builder")
4. Choose a username (e.g. `my_site_builder_bot`)
5. Copy the **bot token** (looks like `123456789:AAFf_xxxxx`)

## Step 2: Get Your Telegram User ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It replies with your user ID (a number like `296168418`)
3. This will be the **admin ID** — only you can manage the bot

## Step 3: Deploy with Docker

### Option A: From GitHub Container Registry (recommended)

```bash
# Create a directory
mkdir pi-orchestrator && cd pi-orchestrator

# Create .env file
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ADMIN_ID=your_user_id_here
DATA_DIR=/data/pi-orchestrator
PERSONA_NAME=Kira
PERSONA_PROMPT=You are Kira, a frontend specialist who builds beautiful sites. Keep responses concise. Use emoji sparingly.
DEBUG=false
EOF

# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  orchestrator-bot:
    image: ghcr.io/igun997/pi-orchestrator:latest
    restart: unless-stopped
    env_file: .env
    volumes:
      - bot-data:/data/pi-orchestrator
    environment:
      - DATA_DIR=/data/pi-orchestrator
      - NODE_ENV=production

volumes:
  bot-data:
EOF

# Run
docker compose up -d
docker compose logs -f
```

### Option B: Build from source

```bash
git clone git@github.com:igun997/pi-orchestrator.git
cd pi-orchestrator
cp .env.example .env
# Edit .env with your bot token and admin ID
docker compose up -d
```

## Step 4: Configure AI Provider

Open your bot on Telegram and send:

```
/setup provider google YOUR_GOOGLE_API_KEY
```

The bot verifies the key and confirms. Supported providers:

| Provider | Command |
|----------|---------|
| Google (Gemini) | `/setup provider google API_KEY` |
| Anthropic (Claude) | `/setup provider anthropic API_KEY` |
| OpenAI (GPT) | `/setup provider openai API_KEY` |
| Groq | `/setup provider groq API_KEY` |

> 💡 **Get a Google AI key**: https://aistudio.google.com/apikey

## Step 5: Configure Cloudflare (Optional)

For deploying built sites to the web:

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. **Create Token** → **Custom token**
3. Permissions: `Account` → `Worker Scripts` → `Edit`
4. Create and copy the token
5. Find your **Account ID**: Cloudflare dashboard → Workers & Pages → right sidebar

```
/setup cloudflare YOUR_CF_TOKEN YOUR_ACCOUNT_ID
```

## Step 6: Build Your First Site! 🚀

### Create a workspace

```
/workspace new my-landing-page
```

### Start the interview

```
/new
```

Kira will ask you questions one by one:

1. **Language** — "Indonesian", "English", etc.
2. **Brand name** — "Warung Digital", "My Startup", etc.
3. **Logo** — describe or say "generate later"
4. **Purpose** — "landing page", "portfolio", "business site"
5. **Tone** — "minimal & elegant", "bold & playful", etc.
6. **Theme** — Kira suggests 2-3 matching presets, pick one
7. **Framework** — Static HTML or Astro + shadcn
8. **Backend** — none, contact-form, auth, cms
9. **Domain** — workers.dev or custom domain

### Confirm and build

After answering all questions, Kira shows a summary. Then:

```
/confirm
```

Kira starts building your site. You'll see progress messages for each step (writing files, running commands). These auto-delete when done.

### Deploy

```
/deploy
```

Kira deploys to Cloudflare Workers and gives you the URL.

---

## Command Reference

### Core Flow
| Command | What it does |
|---------|-------------|
| `/new` | Start new site interview |
| `/confirm` | Build the site from spec |
| `/deploy` | Deploy to Cloudflare Workers |
| `/status` | Show workspace, model, orchestrator phase |
| `/reset` | Wipe orchestrator state, start fresh |
| `/stop` | Abort running session |

### Workspace
| Command | What it does |
|---------|-------------|
| `/workspace new <name>` | Create new workspace |
| `/workspace list` | List all workspaces |
| `/workspace switch <name>` | Switch active workspace |

### Configuration (Admin)
| Command | What it does |
|---------|-------------|
| `/setup provider <name> <key>` | Add AI provider |
| `/setup cloudflare <token> <id>` | Configure deploy |
| `/setup remove <provider>` | Remove provider |
| `/model <name>` | Switch AI model |
| `/allow <user_id>` | Allow another user |
| `/deny <user_id>` | Revoke user access |

### General
| Command | What it does |
|---------|-------------|
| `/start` | Welcome message |
| `/menu` | Interactive button menu |

---

## Available Theme Presets

| Theme | Style |
|-------|-------|
| Clear Glass | Glassmorphism, frosted panels, transparency |
| Neo Brutalist | Raw, chunky borders, loud colors |
| Neon Noir | Dark bg, neon accents, cyberpunk |
| Organic Flow | Soft curves, nature tones, warmth |
| Corporate Edge | Clean, professional, sharp |
| Retro Wave | 80s gradients, synthwave vibes |
| Minimal Zen | Whitespace, calm, understated |
| Bold Impact | High contrast, big type, dramatic |
| Pastel Dream | Soft pastels, rounded, friendly |
| Dark Luxury | Deep tones, gold accents, premium |

---

## Tips

- **Send images**: You can send reference images (screenshots, mockups) and Kira will analyze them
- **Natural language**: Between commands, just chat normally — Kira remembers context
- **Multiple workspaces**: Keep different projects in separate workspaces
- **Reset if stuck**: `/reset` clears everything, `/stop` kills a hanging session
- **Debug mode**: Set `DEBUG=true` in `.env` to see all pi session events in Docker logs

---

## Troubleshooting

### Bot doesn't respond
```bash
docker compose logs --tail 20
```
Check for errors. Common issues:
- Invalid bot token
- Missing API key (run `/setup provider`)

### Session stuck / hanging
```
/stop
```
Then try again. Bash commands timeout after 120s automatically.

### Deploy fails
- Check Cloudflare token scope (needs `Worker Scripts: Edit`)
- Verify account ID is correct
- Run `/setup cloudflare` again with correct credentials

### Start fresh
```
/reset
/new
```

---

## Architecture

```
Telegram → Grammy Bot → Pi AgentSession → Skills/Extensions
                ↓                              ↓
         Credential Store            Orchestrator Interview
         (AES-256-GCM)               → Theme Matching
                                      → Site Building
                                      → Wrangler Deploy
```

All data stored in Docker volume (`bot-data`). No host mounts needed.

## License

MIT
