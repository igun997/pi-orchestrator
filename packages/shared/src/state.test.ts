import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialState, loadState, saveState, statePaths } from "./state.js";

describe("state", () => {
  it("creates expected paths", () => {
    const paths = statePaths("/tmp/site");
    expect(paths.root).toBe("/tmp/site/.orchestrator");
    expect(paths.state).toBe("/tmp/site/.orchestrator/state.json");
  });

  it("saves and loads state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-"));
    const state = createInitialState({ targetDir: dir, designSystemImage: "ds.png", pageImage: "page.png", autoHeal: true });
    await saveState(dir, state);
    const loaded = await loadState(dir);
    expect(loaded.runId).toBe(state.runId);
    expect(loaded.config.autoHeal).toBe(true);
    expect(await readFile(join(dir, ".orchestrator", "state.json"), "utf8")).toContain("designSystemImage");
  });
});
