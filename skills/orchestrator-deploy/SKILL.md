---
name: orchestrator-deploy
description: Deploy built Astro site to Cloudflare Workers via MCP. Handles worker creation, secrets, and deployment.
---

# Orchestrator Deploy

Use during `deploying` phase of pi-orchestrators.

## Workflow

1. Load `.orchestrator/state.json` from target project.
2. Run `pnpm build` (Astro → dist/_worker.js + assets).
3. Create Cloudflare Worker via MCP if not exists.
4. Push secrets (SUPABASE_URL, SUPABASE_ANON_KEY) via MCP.
5. Deploy dist/ via MCP.
6. Optionally attach custom domain.

Never extract, scaffold, or build. This skill only deploys.
