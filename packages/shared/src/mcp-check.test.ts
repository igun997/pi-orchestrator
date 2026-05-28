import { describe, expect, it } from "vitest";
import { REQUIRED_MCPS, OPTIONAL_MCPS, findMissingMcps, renderMcpSnippet } from "./mcp-check.js";

describe("mcp-check", () => {
  it("lists required MCP server names", () => {
    expect(REQUIRED_MCPS).toEqual(["shadcn", "astro-docs"]);
  });

  it("lists optional MCP server names", () => {
    expect(OPTIONAL_MCPS).toEqual(["supabase", "cloudflare"]);
  });

  it("finds required MCP servers that are not available", () => {
    expect(findMissingMcps(["cloudflare", "supabase"], REQUIRED_MCPS)).toEqual(["shadcn", "astro-docs"]);
  });

  it("renders correct bootstrap snippet", () => {
    const parsed = JSON.parse(renderMcpSnippet(["shadcn", "cloudflare"]));
    expect(parsed.mcpServers.shadcn).toEqual({ command: "npx", args: ["shadcn@latest", "mcp"] });
    expect(parsed.mcpServers.cloudflare).toEqual({ command: "npx", args: ["@cloudflare/mcp-server"] });
  });
});
