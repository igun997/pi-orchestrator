import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RunStateSchema, type RunState } from "./schemas.js";

export function statePaths(targetDir: string) {
  const root = join(targetDir, ".orchestrator");
  return {
    root,
    inputs: join(root, "inputs"),
    specs: join(root, "specs"),
    logs: join(root, "logs"),
    checkpoints: join(root, "checkpoints"),
    state: join(root, "state.json")
  };
}

export function createInitialState(args: { targetDir: string; designSystemImage?: string; pageImage?: string; autoHeal?: boolean }): RunState {
  return RunStateSchema.parse({
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    phase: "idle",
    inputs: { designSystemImage: args.designSystemImage, pageImage: args.pageImage },
    specs: {},
    answers: {},
    confirmed: false,
    tasks: [],
    stack: {},
    config: { autoHeal: args.autoHeal ?? false, maxParallelImpeccable: 3 },
    deployment: {}
  });
}

export async function ensureStateDirs(targetDir: string) {
  const paths = statePaths(targetDir);
  await Promise.all([paths.root, paths.inputs, paths.specs, paths.logs, paths.checkpoints].map((path) => mkdir(path, { recursive: true })));
}

export async function saveState(targetDir: string, state: RunState) {
  const parsed = RunStateSchema.parse(state);
  await ensureStateDirs(targetDir);
  await writeFile(statePaths(targetDir).state, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export async function loadState(targetDir: string): Promise<RunState> {
  const raw = await readFile(statePaths(targetDir).state, "utf8");
  return RunStateSchema.parse(JSON.parse(raw));
}
