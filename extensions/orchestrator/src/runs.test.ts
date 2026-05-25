import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRun, renderStatus } from "./runs.js";

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
      deployment: {}
    })).toContain("extracting");
  });
});
