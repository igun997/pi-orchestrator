import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRun, listRuns, renderStatus, resetRun, retryTask } from "./runs.js";

describe("runs", () => {
  it("creates run state in target dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-run-"));
    const state = await createRun({ targetDir: dir, designSystemImage: "ds.png", pageImage: "page.png", autoHeal: false });

    expect(state.phase).toBe("extracting");
    expect(state.inputs.pageImage).toBe("page.png");
  });

  it("renders status", () => {
    expect(renderStatus({
      runId: "r1",
      phase: "extracting",
      tasks: [],
      createdAt: "now",
      inputs: {},
      specs: {},
      answers: {},
      confirmed: false,
      stack: {},
      config: { autoHeal: false, maxParallelImpeccable: 3 },
      options: { dashboard: false },
      deployment: {}
    })).toContain("extracting");
  });

  it("lists no runs for missing runs dir", async () => {
    const dir = join(tmpdir(), `orch-runs-missing-${Date.now()}`);

    await expect(listRuns(dir)).resolves.toEqual([]);
  });

  it("removes orchestrator state when resetting run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-reset-"));
    await mkdir(join(dir, ".orchestrator", "logs"), { recursive: true });
    await writeFile(join(dir, ".orchestrator", "logs", "task.log"), "log", "utf8");

    await resetRun(dir);

    await expect(mkdir(join(dir, ".orchestrator"))).resolves.toBeUndefined();
  });

  it("marks specified task pending when retrying", () => {
    const state = {
      runId: "r1",
      phase: "building" as const,
      tasks: [
        { id: "shape", name: "Shape", status: "complete" as const, deps: [], errorRef: "logs/shape.err" },
        { id: "craft", name: "Craft", status: "failed" as const, deps: ["shape"], errorRef: "logs/craft.err" }
      ],
      createdAt: "now",
      inputs: {},
      specs: {},
      answers: {},
      confirmed: false,
      stack: {},
      config: { autoHeal: false, maxParallelImpeccable: 3 },
      options: { dashboard: false },
      deployment: {}
    };

    const next = retryTask(state, "craft");

    expect(next.tasks.find((task) => task.id === "craft")?.status).toBe("pending");
    expect(next.tasks.find((task) => task.id === "craft")?.errorRef).toBeUndefined();
    expect(state.tasks.find((task) => task.id === "craft")?.status).toBe("failed");
  });
});
