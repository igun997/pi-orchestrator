import { describe, expect, it } from "vitest";
import { renderProgressWidget, renderProgressStatus } from "./progress.js";
import type { Task } from "@orchestrator/shared";

function task(id: string, status: Task["status"]): Task {
  return { id, name: id.replace(/-/g, " "), status, deps: [] };
}

describe("progress", () => {
  it("renders widget with running tasks", () => {
    const tasks = [
      task("astro-init", "complete"),
      task("write-context", "complete"),
      task("shadcn-init", "running"),
      task("impeccable-shape", "pending"),
      task("craft-hero", "pending"),
    ];
    const lines = renderProgressWidget("scaffolding", tasks);
    expect(lines[0]).toContain("Orchestrator");
    expect(lines[1]).toContain("scaffolding");
    expect(lines.some((l) => l.includes("▶"))).toBe(true);
    expect(lines.some((l) => l.includes("shadcn init"))).toBe(true);
  });

  it("renders status line", () => {
    const tasks = [
      task("a", "complete"),
      task("b", "running"),
      task("c", "pending"),
    ];
    const status = renderProgressStatus("building", tasks);
    expect(status).toContain("building");
    expect(status).toContain("1/3");
    expect(status).toContain("▶1");
  });

  it("shows failed tasks", () => {
    const tasks = [
      task("a", "complete"),
      task("b", "failed"),
    ];
    const lines = renderProgressWidget("failed", tasks);
    expect(lines.some((l) => l.includes("✗"))).toBe(true);
    const status = renderProgressStatus("failed", tasks);
    expect(status).toContain("✗1");
  });

  it("handles empty tasks", () => {
    const lines = renderProgressWidget("extracting", []);
    expect(lines.length).toBeGreaterThan(2);
    const status = renderProgressStatus("extracting", []);
    expect(status).toBe("orchestrator: extracting");
  });
});
