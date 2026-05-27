import { describe, expect, it } from "vitest";
import { createSubagentTools } from "./tools.js";

describe("createSubagentTools", () => {
  it("returns 3 tools with correct names", () => {
    const tools = createSubagentTools("/tmp/test");
    const names = tools.map(t => t.name);
    expect(names).toContain("read_image");
    expect(names).toContain("merge_sections");
    expect(names).toContain("hex_to_oklch");
    expect(tools).toHaveLength(3);
  });

  it("hex_to_oklch converts single color", async () => {
    const tools = createSubagentTools("/tmp/test");
    const hexTool = tools.find(t => t.name === "hex_to_oklch")!;
    const result = await hexTool.execute("call-1", { colors: "#FF0000" }, new AbortController().signal, () => {}, { cwd: "/tmp" } as any);
    expect(result.content[0]).toHaveProperty("text");
    expect((result.content[0] as any).text).toContain("oklch(");
  });

  it("hex_to_oklch converts batch", async () => {
    const tools = createSubagentTools("/tmp/test");
    const hexTool = tools.find(t => t.name === "hex_to_oklch")!;
    const result = await hexTool.execute("call-1", { colors: { primary: "#FF0000" } }, new AbortController().signal, () => {}, { cwd: "/tmp" } as any);
    expect((result.content[0] as any).text).toContain("primary");
  });

  it("read_image returns error for missing file", async () => {
    const tools = createSubagentTools("/tmp/test");
    const imgTool = tools.find(t => t.name === "read_image")!;
    const result = await imgTool.execute("call-1", { path: "/nonexistent/img.png" }, new AbortController().signal, () => {}, { cwd: "/tmp" } as any);
    expect((result.content[0] as any).text).toContain("not found");
  });

  it("read_image returns error for unsupported format", async () => {
    // Create a temp file with unsupported extension
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join("/tmp", "tools-test-"));
    const bmpPath = join(dir, "test.bmp");
    writeFileSync(bmpPath, "fake");
    
    const tools = createSubagentTools("/tmp/test");
    const imgTool = tools.find(t => t.name === "read_image")!;
    const result = await imgTool.execute("call-1", { path: bmpPath }, new AbortController().signal, () => {}, { cwd: "/tmp" } as any);
    expect((result.content[0] as any).text).toContain("Unsupported");
  });
});
