import type { Task } from "@orchestrator/shared";

/**
 * Renders a visual progress widget for the orchestrator pipeline.
 * Shows phase, task progress bar, and current/next tasks.
 */
/**
 * Format milliseconds as m:ss.
 */
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function renderProgressWidget(phase: string, tasks: Task[], startTimes?: Map<string, number>): string[] {
  const total = tasks.length;
  const complete = tasks.filter((t) => t.status === "complete" || t.status === "skipped").length;
  const running = tasks.filter((t) => t.status === "running").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const pending = tasks.filter((t) => t.status === "pending").length;

  // Progress bar
  const barWidth = 30;
  const filled = total > 0 ? Math.round((complete / total) * barWidth) : 0;
  const runningChars = total > 0 ? Math.max(1, Math.round((running / total) * barWidth)) : 0;
  const bar = "█".repeat(filled) + "▓".repeat(Math.min(runningChars, barWidth - filled)) + "░".repeat(Math.max(0, barWidth - filled - runningChars));
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

  const lines: string[] = [
    `┌─ Orchestrator ─────────────────────────┐`,
    `│ Phase: ${phase.padEnd(32)}│`,
    `│ [${bar}] ${String(pct).padStart(3)}% │`,
    `│ ✓${String(complete).padStart(2)} ▶${String(running).padStart(2)} ○${String(pending).padStart(2)} ✗${String(failed).padStart(2)} / ${String(total).padStart(2)} total   │`,
  ];

  // Show running tasks
  const runningTasks = tasks.filter((t) => t.status === "running");
  if (runningTasks.length > 0) {
    lines.push(`│${"─".repeat(40)}│`);
    for (const t of runningTasks.slice(0, 3)) {
      const started = startTimes?.get(t.id);
      const timeStr = started ? formatElapsed(Date.now() - started) : "";
      const nameWidth = timeStr ? 31 : 37;
      const name = t.name.length > nameWidth ? t.name.slice(0, nameWidth - 3) + "..." : t.name;
      const pad = timeStr ? `${name.padEnd(31)} ${timeStr.padStart(5)}` : name.padEnd(37);
      lines.push(`│ ▶ ${pad}│`);
    }
    if (runningTasks.length > 3) {
      lines.push(`│   +${runningTasks.length - 3} more...${" ".repeat(28)}│`);
    }
  }

  // Show failed tasks
  if (failed > 0) {
    const failedTasks = tasks.filter((t) => t.status === "failed");
    lines.push(`│${"─".repeat(40)}│`);
    for (const t of failedTasks.slice(0, 2)) {
      const name = t.name.length > 36 ? t.name.slice(0, 33) + "..." : t.name;
      lines.push(`│ ✗ ${name.padEnd(37)}│`);
    }
  }

  lines.push(`└${"─".repeat(40)}┘`);
  return lines;
}

/**
 * Renders a compact status line for the footer.
 */
export function renderProgressStatus(phase: string, tasks: Task[]): string {
  const total = tasks.length;
  const complete = tasks.filter((t) => t.status === "complete" || t.status === "skipped").length;
  const running = tasks.filter((t) => t.status === "running").length;
  const failed = tasks.filter((t) => t.status === "failed").length;

  if (total === 0) return `orchestrator: ${phase}`;

  const pct = Math.round((complete / total) * 100);
  const failStr = failed > 0 ? ` ✗${failed}` : "";
  return `orchestrator: ${phase} [${complete}/${total} ${pct}%${failStr}]${running > 0 ? " ▶" + running : ""}`;
}
