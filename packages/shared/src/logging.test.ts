import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeTaskLog, errorRef } from "./logging.js";

describe("logging", () => {
  it("writes task log and returns errorRef", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-log-"));
    await writeTaskLog(dir, "craft-hero", "Error: component not found\nat line 42");
    const content = await readFile(join(dir, ".orchestrator/logs/craft-hero.log"), "utf8");
    expect(content).toContain("component not found");
  });

  it("errorRef returns relative path", () => {
    expect(errorRef("craft-hero")).toBe("logs/craft-hero.log");
    expect(errorRef("craft-hero", 42)).toBe("logs/craft-hero.log:42");
  });
});
