import { describe, expect, it } from "vitest";
import { REQUIRED_MCPS, findMissingMcps, renderMcpSnippet } from "./mcp-check.js";

describe("mcp-check", () => {
  it("lists required MCP server names", () => {
    expect(REQUIRED_MCPS).toEqual(["cloudflare", "shadcn", "supabase"]);
  });

  it("finds required MCP servers that are not available", () => {
    expect(findMissingMcps(["cloudflare", "supabase"], REQUIRED_MCPS)).toEqual(["shadcn"]);
  });

  it("renders a bootstrap snippet for missing MCP servers", () => {
    expect(JSON.parse(renderMcpSnippet(["cloudflare", "shadcn"]))).toEqual({
      mcpServers: {
        cloudflare: {
          command: "<command>",
          args: ["<args>"]
        },
        shadcn: {
          command: "<command>",
          args: ["<args>"]
        }
      }
    });
  });
});
