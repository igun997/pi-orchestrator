import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialState, loadState, saveState } from "@orchestrator/shared";
import { describe, expect, it } from "vitest";
import { runExtract } from "./index.js";
import { MockVisionClient } from "./vision.js";

describe("runExtract", () => {
  it("writes specs, completes extract tasks, and advances to questioning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-extract-"));
    const state = createInitialState({ targetDir: dir, designSystemImage: "ds.png", pageImage: "page.png" });
    state.phase = "extracting";
    state.tasks = [
      { id: "extract-design-system", name: "Extract design system", status: "pending", deps: [] },
      { id: "extract-page", name: "Extract page", status: "pending", deps: [] },
      { id: "questions", name: "Ask gap questions", status: "pending", deps: ["extract-design-system", "extract-page"] }
    ];
    await saveState(dir, state);

    const next = await runExtract(dir, new MockVisionClient());

    expect(next.phase).toBe("questioning");
    expect(next.specs.designSystem).toBe(".orchestrator/specs/design-system.json");
    expect(next.specs.page).toBe(".orchestrator/specs/page-spec.json");
    expect(next.tasks.find((task) => task.id === "extract-design-system")?.status).toBe("complete");
    expect(next.tasks.find((task) => task.id === "extract-page")?.status).toBe("complete");

    const designSystem = JSON.parse(await readFile(join(dir, ".orchestrator/specs/design-system.json"), "utf8"));
    const pageSpec = JSON.parse(await readFile(join(dir, ".orchestrator/specs/page-spec.json"), "utf8"));
    expect(designSystem.colors.primary).toContain("oklch");
    expect(pageSpec.sections[0].id).toBe("hero");

    const saved = await loadState(dir);
    expect(saved.phase).toBe("questioning");
    expect(saved.specs.page).toBe(".orchestrator/specs/page-spec.json");
  });
});
