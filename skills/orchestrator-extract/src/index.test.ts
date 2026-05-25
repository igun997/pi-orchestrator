import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialState, saveState } from "@orchestrator/shared";
import { runExtract } from "./index.js";
import { MockVisionClient } from "./vision.js";

describe("runExtract", () => {
  it("writes specs and advances to questioning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-extract-"));
    const state = createInitialState({ targetDir: dir, designSystemImage: "ds.png", pageImage: "page.png" });
    state.phase = "extracting";
    state.tasks = [
      { id: "extract-design-system", name: "Extract design system", status: "pending", deps: [] },
      { id: "extract-page", name: "Extract page", status: "pending", deps: [] },
      { id: "questions", name: "Ask gap questions", status: "pending", deps: ["extract-design-system", "extract-page"] },
      { id: "confirm", name: "Confirm plan", status: "pending", deps: ["questions"] }
    ];
    await saveState(dir, state);

    const next = await runExtract(dir, new MockVisionClient());
    expect(next.phase).toBe("questioning");
    expect(next.specs.designSystem).toBe(".orchestrator/specs/design-system.json");
    expect(next.specs.page).toBe(".orchestrator/specs/page-spec.json");

    const dsContent = await readFile(join(dir, ".orchestrator/specs/design-system.json"), "utf8");
    expect(dsContent).toContain("oklch");

    const pageContent = await readFile(join(dir, ".orchestrator/specs/page-spec.json"), "utf8");
    expect(pageContent).toContain("hero");

    const extractTasks = next.tasks.filter((t) => t.id.startsWith("extract-"));
    expect(extractTasks.every((t) => t.status === "complete")).toBe(true);
  });
});
