import type { Task } from "@orchestrator/shared";

/**
 * Format milliseconds as m:ss.
 */
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

/**
 * Build a progress bar string of given width.
 */
function buildBar(complete: number, running: number, total: number, width: number): string {
  if (total === 0) return "▱".repeat(width);
  const filled = Math.round((complete / total) * width);
  const runningChars = Math.max(running > 0 ? 1 : 0, Math.round((running / total) * width));
  const cap = Math.min(runningChars, width - filled);
  return "▰".repeat(filled) + "▸".repeat(cap) + "▱".repeat(Math.max(0, width - filled - cap));
}

/**
 * Compute progress stats from task list.
 */
export function computeStats(tasks: Task[]) {
  const total = tasks.length;
  const complete = tasks.filter((t) => t.status === "complete" || t.status === "skipped").length;
  const running = tasks.filter((t) => t.status === "running").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  return { total, complete, running, failed, pending, pct };
}

/**
 * Theme-aware widget line builder.
 * Returns a factory function for use with `ctx.ui.setWidget("orchestrator", factory)`.
 *
 * The factory receives (tui, theme) from pi and returns a component-like object
 * with render/invalidate. Uses theme.fg() for colored output.
 */
export function progressWidgetFactory(
  phase: string,
  tasks: Task[],
  startTimes?: Map<string, number>
) {
  return (_tui: unknown, theme: any) => {
    const stats = computeStats(tasks);
    const barWidth = 28;
    const bar = buildBar(stats.complete, stats.running, stats.total, barWidth);

    // Build themed bar segments
    const filledPart = bar.replace(/[▸▱]/g, "");
    const runPart = bar.replace(/[▰▱]/g, "");
    const emptyPart = bar.replace(/[▰▸]/g, "");
    const themedBar =
      theme.fg("success", filledPart) +
      theme.fg("warning", runPart) +
      theme.fg("dim", emptyPart);

    const lines: string[] = [];

    // Header
    lines.push(theme.fg("accent", "─".repeat(42)));
    lines.push(
      theme.fg("accent", theme.bold(" Orchestrator")) +
      theme.fg("muted", `  ${phase}`)
    );

    // Progress bar
    lines.push(` ${themedBar}  ${theme.fg("text", `${String(stats.pct).padStart(3)}%`)}`);

    // Counters
    lines.push(
      " " +
      theme.fg("success", `✓${stats.complete}`) + "  " +
      theme.fg("warning", `▶${stats.running}`) + "  " +
      theme.fg("muted", `○${stats.pending}`) + "  " +
      (stats.failed > 0 ? theme.fg("error", `✗${stats.failed}`) : theme.fg("dim", `✗${stats.failed}`)) +
      theme.fg("dim", `  / ${stats.total}`)
    );

    // Running tasks with elapsed
    const running = tasks.filter((t) => t.status === "running");
    if (running.length > 0) {
      lines.push("");
      for (const t of running.slice(0, 4)) {
        const started = startTimes?.get(t.id);
        const elapsed = started ? formatElapsed(Date.now() - started) : "";
        lines.push(
          " " + theme.fg("warning", "▶") + " " +
          theme.fg("text", t.name) +
          (elapsed ? "  " + theme.fg("muted", elapsed) : "")
        );
      }
      if (running.length > 4) {
        lines.push(theme.fg("dim", `   +${running.length - 4} more…`));
      }
    }

    // Failed tasks
    const failedTasks = tasks.filter((t) => t.status === "failed");
    if (failedTasks.length > 0) {
      lines.push("");
      for (const t of failedTasks.slice(0, 3)) {
        lines.push(" " + theme.fg("error", `✗ ${t.name}`));
      }
    }

    lines.push(theme.fg("accent", "─".repeat(42)));

    return {
      render: () => lines,
      invalidate: () => {},
    };
  };
}

/**
 * Renders a compact status line for the footer.
 */
export function renderProgressStatus(phase: string, tasks: Task[]): string {
  const stats = computeStats(tasks);
  if (stats.total === 0) return `orchestrator: ${phase}`;
  const failStr = stats.failed > 0 ? ` ✗${stats.failed}` : "";
  return `orchestrator: ${phase} [${stats.complete}/${stats.total} ${stats.pct}%${failStr}]${stats.running > 0 ? " ▶" + stats.running : ""}`;
}

/**
 * Legacy plain-text widget renderer (returns lines).
 * Kept for backward compatibility with tests and non-TUI consumers.
 */
export function renderProgressWidget(phase: string, tasks: Task[], startTimes?: Map<string, number>): string[] {
  const stats = computeStats(tasks);
  const barWidth = 30;
  const bar = buildBar(stats.complete, stats.running, stats.total, barWidth);

  const lines: string[] = [
    `┌─ Orchestrator ─────────────────────────┐`,
    `│ Phase: ${phase.padEnd(32)}│`,
    `│ [${bar}] ${String(stats.pct).padStart(3)}% │`,
    `│ ✓${String(stats.complete).padStart(2)} ▶${String(stats.running).padStart(2)} ○${String(stats.pending).padStart(2)} ✗${String(stats.failed).padStart(2)} / ${String(stats.total).padStart(2)} total   │`,
  ];

  const running = tasks.filter((t) => t.status === "running");
  if (running.length > 0) {
    lines.push(`│${"─".repeat(40)}│`);
    for (const t of running.slice(0, 3)) {
      const started = startTimes?.get(t.id);
      const timeStr = started ? formatElapsed(Date.now() - started) : "";
      const nameWidth = timeStr ? 31 : 37;
      const name = t.name.length > nameWidth ? t.name.slice(0, nameWidth - 3) + "..." : t.name;
      const pad = timeStr ? `${name.padEnd(31)} ${timeStr.padStart(5)}` : name.padEnd(37);
      lines.push(`│ ▶ ${pad}│`);
    }
    if (running.length > 3) {
      lines.push(`│   +${running.length - 3} more...${" ".repeat(28)}│`);
    }
  }

  if (stats.failed > 0) {
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
