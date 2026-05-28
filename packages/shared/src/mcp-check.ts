export const REQUIRED_MCPS = ["shadcn", "astro-docs"] as const;
export const OPTIONAL_MCPS = ["supabase", "cloudflare"] as const;
export type RequiredMcp = (typeof REQUIRED_MCPS)[number];
export type OptionalMcp = (typeof OPTIONAL_MCPS)[number];

export function findMissingMcps(available: readonly string[], required: readonly string[] = REQUIRED_MCPS): string[] {
  const availableSet = new Set(available);
  return required.filter((name) => !availableSet.has(name));
}

interface McpCommandConfig {
  command: string;
  args: string[];
}

interface McpHttpConfig {
  name: string;
  url: string;
  transport: "streamable-http";
}

type McpConfig = McpCommandConfig | McpHttpConfig;

const MCP_CONFIGS: Record<string, McpConfig> = {
  shadcn: { command: "npx", args: ["shadcn@latest", "mcp"] },
  supabase: { command: "npx", args: ["@supabase/mcp-server"] },
  cloudflare: { command: "npx", args: ["@cloudflare/mcp-server"] },
  "astro-docs": { name: "Astro Docs", url: "https://mcp.docs.astro.build/mcp", transport: "streamable-http" }
};

export function renderMcpSnippet(missing: readonly string[]): string {
  const mcpServers = Object.fromEntries(
    missing.map((name) => [name, MCP_CONFIGS[name] ?? { command: "npx", args: [`@${name}/mcp-server`] }])
  );
  return JSON.stringify({ mcpServers }, null, 2);
}
