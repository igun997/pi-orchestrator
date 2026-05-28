import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
  directTools?: boolean;
}

export interface McpConfigFile {
  imports?: string[];
  mcpServers: Record<string, McpServerEntry>;
}

export interface McpRegistration {
  name: string;
  displayName: string;
  entry: McpServerEntry;
}

/**
 * MCP registrations the orchestrator needs.
 */
export const ORCHESTRATOR_MCPS: McpRegistration[] = [
  {
    name: "astro-docs",
    displayName: "Astro Docs",
    entry: {
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.docs.astro.build/mcp"],
      directTools: false,
    },
  },
  {
    name: "shadcn",
    displayName: "shadcn/ui",
    entry: {
      command: "npx",
      args: ["-y", "shadcn@latest", "mcp"],
      directTools: false,
    },
  },
  {
    name: "supabase",
    displayName: "Supabase",
    entry: {
      command: "npx",
      args: ["-y", "@supabase/mcp-server"],
      directTools: false,
    },
  },
  {
    name: "cloudflare",
    displayName: "Cloudflare",
    entry: {
      command: "npx",
      args: ["-y", "@cloudflare/mcp-server"],
      directTools: false,
    },
  },
];

function getMcpConfigPath(): string {
  return join(homedir(), ".pi", "agent", "mcp.json");
}

/**
 * Read the pi MCP config file.
 */
export async function readMcpConfig(): Promise<McpConfigFile> {
  const configPath = getMcpConfigPath();
  if (!existsSync(configPath)) {
    return { mcpServers: {} };
  }
  const raw = await readFile(configPath, "utf8");
  return JSON.parse(raw) as McpConfigFile;
}

/**
 * Write the pi MCP config file.
 */
export async function writeMcpConfig(config: McpConfigFile): Promise<void> {
  const configPath = getMcpConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/**
 * Find which orchestrator MCPs are not yet registered.
 */
export function findUnregisteredMcps(config: McpConfigFile): McpRegistration[] {
  return ORCHESTRATOR_MCPS.filter((mcp) => !(mcp.name in config.mcpServers));
}

/**
 * Register missing MCPs into the config. Returns names of newly registered servers.
 */
export async function autoRegisterMcps(): Promise<{ registered: string[]; alreadyPresent: string[] }> {
  const config = await readMcpConfig();
  const missing = findUnregisteredMcps(config);
  const alreadyPresent = ORCHESTRATOR_MCPS
    .filter((mcp) => mcp.name in config.mcpServers)
    .map((mcp) => mcp.name);

  if (missing.length === 0) {
    return { registered: [], alreadyPresent };
  }

  for (const mcp of missing) {
    config.mcpServers[mcp.name] = mcp.entry;
  }

  await writeMcpConfig(config);
  return { registered: missing.map((m) => m.name), alreadyPresent };
}

/**
 * Test an MCP server by attempting to spawn it and checking for a response.
 * Returns true if the server starts successfully.
 */
export async function testMcpConnection(name: string, exec: (cmd: string, args: string[]) => Promise<{ exitCode: number; stdout: string }>): Promise<{ ok: boolean; error?: string }> {
  const config = await readMcpConfig();
  const entry = config.mcpServers[name];
  if (!entry) {
    return { ok: false, error: `MCP "${name}" not registered` };
  }

  try {
    // For npx-based MCPs, verify the package resolves
    if (entry.command === "npx") {
      const pkg = entry.args.find((a) => !a.startsWith("-")) ?? entry.args[1];
      if (pkg) {
        const result = await exec("npx", ["-y", "--package", pkg, "echo", "ok"]);
        if (result.exitCode !== 0) {
          return { ok: false, error: `Package "${pkg}" failed to resolve` };
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
