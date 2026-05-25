export const REQUIRED_MCPS = ["cloudflare", "shadcn", "supabase"] as const;

export function findMissingMcps(available: readonly string[], required: readonly string[]): string[] {
  const availableSet = new Set(available);
  return required.filter((name) => !availableSet.has(name));
}

export function renderMcpSnippet(missing: readonly string[]): string {
  const mcpServers = Object.fromEntries(
    missing.map((name) => [
      name,
      {
        command: "<command>",
        args: ["<args>"]
      }
    ])
  );

  return JSON.stringify({ mcpServers }, null, 2);
}
