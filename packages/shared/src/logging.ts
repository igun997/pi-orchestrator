import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeTaskLog(targetDir: string, taskId: string, text: string): Promise<void> {
  const logsDir = join(targetDir, ".orchestrator/logs");
  await mkdir(logsDir, { recursive: true });
  await appendFile(join(logsDir, `${taskId}.log`), `${text}\n`, "utf8");
}

export function errorRef(taskId: string, line?: number): string {
  const ref = `logs/${taskId}.log`;
  return line != null ? `${ref}:${line}` : ref;
}
