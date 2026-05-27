import type { Task } from "@orchestrator/shared";
import { join } from "node:path";

type FileChecker = (path: string) => Promise<boolean>;

export interface VerifyOptions {
  framework?: "astro" | "static";
  projectDir: string;
}

function expectedFile(taskId: string, opts: VerifyOptions): string | null {
  const { projectDir, framework } = opts;
  const isAstro = framework !== "static";

  if (taskId.startsWith("craft-")) {
    const sectionId = taskId.replace("craft-", "");
    return isAstro
      ? join(projectDir, `src/components/sections/${sectionId}.astro`)
      : join(projectDir, `src/sections/${sectionId}.html`);
  }
  if (taskId === "assemble-page") {
    return isAstro
      ? join(projectDir, "src/pages/index.astro")
      : join(projectDir, "src/index.html");
  }
  if (taskId === "cf-build") return join(projectDir, "dist/_worker.js");
  return null;
}

export async function verifyTasks(
  tasks: Task[],
  opts: VerifyOptions,
  fileExists: FileChecker
): Promise<Task[]> {
  const results: Task[] = [];

  for (const task of tasks) {
    if (task.status !== "complete") {
      results.push(task);
      continue;
    }

    // Deploy tasks always re-run
    if (task.id.startsWith("cf-deploy") || task.id === "cf-domain-attach") {
      results.push({ ...task, status: "pending" });
      continue;
    }

    // Check file-based tasks
    const file = expectedFile(task.id, opts);
    if (file) {
      const exists = await fileExists(file);
      results.push(exists ? task : { ...task, status: "pending" });
    } else {
      results.push(task);
    }
  }

  return results;
}
