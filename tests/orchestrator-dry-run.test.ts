import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialState, saveState, loadState } from "../packages/shared/src/index.js";
import { runExtract } from "../skills/orchestrator-extract/src/index.js";
import { MockVisionClient } from "../skills/orchestrator-extract/src/vision.js";
import { generateQuestions } from "../skills/orchestrator-extract/src/questions.js";
import { renderConfirmSummary } from "../skills/orchestrator-extract/src/summary.js";
import { writeContext } from "../skills/orchestrator-context/src/write-context.js";
import { planScaffoldTasks } from "../skills/orchestrator-scaffold/src/plan.js";
import { planBuildTasks } from "../skills/orchestrator-build/src/plan.js";
import { planDeployTasks } from "../skills/orchestrator-deploy/src/plan.js";

describe("orchestrator dry-run e2e", () => {
  it("runs full pipeline from extract to task graph", async () => {
    // 1. Create temp target dir
    const dir = await mkdtemp(join(tmpdir(), "orch-e2e-"));

    // 2. Create run
    const state = createInitialState({ targetDir: dir, designSystemImage: "ds.png", pageImage: "page.png" });
    state.phase = "extracting";
    state.tasks = [
      { id: "extract-design-system", name: "Extract design system", status: "pending", deps: [] },
      { id: "extract-page", name: "Extract page", status: "pending", deps: [] },
      { id: "questions", name: "Ask gap questions", status: "pending", deps: ["extract-design-system", "extract-page"] },
      { id: "confirm", name: "Confirm plan", status: "pending", deps: ["questions"] }
    ];
    await saveState(dir, state);

    // 3. Run extract with mock vision
    const afterExtract = await runExtract(dir, new MockVisionClient());
    expect(afterExtract.phase).toBe("questioning");

    // 4. Generate questions
    const pageSpec = JSON.parse(await readFile(join(dir, ".orchestrator/specs/page-spec.json"), "utf8"));
    const questions = generateQuestions(pageSpec);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(8);

    // 5. Simulate answers + confirm
    const answers: Record<string, unknown> = {
      "product-name": "Acme Corp",
      "target-users": "Developers building fast",
      "tone": "bold, modern, technical",
      "anti-references": "corporate, bland",
      "register": "brand",
      "backend-level": "contact-form",
      "domain": "acme.workers.dev"
    };
    afterExtract.answers = answers;
    afterExtract.confirmed = true;
    afterExtract.phase = "confirming";
    await saveState(dir, afterExtract);

    // 6. Render confirm summary
    const summary = renderConfirmSummary({ answers, sectionCount: pageSpec.sections.length, taskCount: 20 });
    expect(summary).toContain("Acme Corp");
    expect(summary).toContain("contact-form");

    // 7. Write PRODUCT.md/DESIGN.md
    await writeContext(dir);
    const productMd = await readFile(join(dir, "PRODUCT.md"), "utf8");
    const designMd = await readFile(join(dir, "DESIGN.md"), "utf8");
    expect(productMd).toContain("register:");
    expect(productMd).toContain("Acme Corp");
    expect(designMd).toContain("oklch");

    // 8. Plan scaffold/build/deploy tasks
    const scaffoldTasks = planScaffoldTasks("contact-form");
    const buildTasks = planBuildTasks(pageSpec.sections);
    const deployTasks = planDeployTasks("acme.workers.dev");

    const allTaskIds = [
      ...scaffoldTasks.map((t) => t.id),
      ...buildTasks.map((t) => t.id),
      ...deployTasks.map((t) => t.id)
    ];

    // Assert expected task ids present
    expect(allTaskIds).toContain("astro-init");
    expect(allTaskIds).toContain("supabase-provision");
    expect(allTaskIds).toContain("impeccable-shape");
    expect(allTaskIds).toContain("craft-hero");
    expect(allTaskIds).toContain("assemble-page");
    expect(allTaskIds).toContain("polish");
    expect(allTaskIds).toContain("audit");
    expect(allTaskIds).toContain("cf-build");
    expect(allTaskIds).toContain("cf-deploy");
  });
});
