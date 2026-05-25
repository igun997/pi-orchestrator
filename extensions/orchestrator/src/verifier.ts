import type { Task } from "@orchestrator/shared";
import { join } from "node:path";

type FileChecker = (path: string) => Promise<boolean>;

function expectedFile(taskId: string, targetDir: string): string | null {
  if (taskId.startsWith("craft-")) {
    const sectionId = taskId.replace("craft-", "");
    return join(targetDir, `src/components/${sectionId}.astro`);
  }
  if (taskId === "assemble-page") return join(targetDir, "src/pages/index.astro");
  if (taskId === "cf-build") return join(targetDir, "dist/_worker.js");
  return null;
}

export async function verifyTasks(
  tasks: Task[],
  targetDir: string,
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
    const file = expectedFile(task.id, targetDir);
    if (file) {
      const exists = await fileExists(file);
      results.push(exists ? task : { ...task, status: "pending" });
    } else {
      results.push(task);
    }
  }

  return results;
}
