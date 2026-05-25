import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DesignSystemSchema, PageSpecSchema, loadState, saveState, statePaths } from "@orchestrator/shared";
import { MockVisionClient, type VisionClient } from "./vision.js";

export * from "./prompts.js";

export async function runExtract(targetDir: string, client: VisionClient = new MockVisionClient()) {
  const state = await loadState(targetDir);
  if (!state.inputs.designSystemImage || !state.inputs.pageImage) {
    throw new Error("missing input images");
  }

  const [designSystemResult, pageSpecResult] = await Promise.all([
    client.extractDesignSystem(state.inputs.designSystemImage),
    client.extractPageSpec(state.inputs.pageImage)
  ]);

  const designSystem = DesignSystemSchema.parse(designSystemResult);
  const pageSpec = PageSpecSchema.parse(pageSpecResult);
  const paths = statePaths(targetDir);

  await Promise.all([
    writeFile(join(paths.specs, "design-system.json"), `${JSON.stringify(designSystem, null, 2)}\n`, "utf8"),
    writeFile(join(paths.specs, "page-spec.json"), `${JSON.stringify(pageSpec, null, 2)}\n`, "utf8")
  ]);

  state.specs = {
    designSystem: ".orchestrator/specs/design-system.json",
    page: ".orchestrator/specs/page-spec.json"
  };
  state.phase = "questioning";
  state.tasks = state.tasks.map((task) => (
    task.id === "extract-design-system" || task.id === "extract-page"
      ? { ...task, status: "complete" }
      : task
  ));

  await saveState(targetDir, state);
  return state;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targetDir = process.argv[2] ?? process.cwd();
  await runExtract(targetDir);
}
