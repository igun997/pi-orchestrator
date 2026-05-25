# MCP Bootstrap

## Required servers

The orchestrator needs three MCP servers configured:

- **cloudflare** — deploy Workers, manage secrets, attach domains
- **shadcn** — install UI components from registry
- **supabase** — create projects, apply schemas, generate types

## Check availability

```bash
/orchestrator:doctor
```

## If servers are missing

Add to your pi MCP config (`~/.pi/mcp.json` or project `.pi/mcp.json`):

```json
{
  "mcpServers": {
    "cloudflare": {
      "command": "npx",
      "args": ["@cloudflare/mcp-server"]
    },
    "shadcn": {
      "command": "npx",
      "args": ["@shadcn/mcp-server"]
    },
    "supabase": {
      "command": "npx",
      "args": ["@supabase/mcp-server"]
    }
  }
}
```

After adding, restart pi or run `/reload` to pick up new servers.

## Verification

Run `/orchestrator:doctor` again — should report all three present.
