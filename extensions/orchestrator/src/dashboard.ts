/**
 * Dashboard server — serves a real-time progress UI via HTTP + SSE.
 * Zero external dependencies. Uses node:http only.
 *
 * Usage:
 *   const dash = await startDashboard({ open: true });
 *   dash.emit({ type: "task-start", taskId: "craft-hero", taskName: "Craft hero" });
 *   dash.emit({ type: "task-end", taskId: "craft-hero", status: "complete" });
 *   await dash.stop();
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { getDashboardHtml } from "./dashboard-html.js";

// ─── Event Types ────────────────────────────────────────────────────────────

export type DashboardEvent =
  | { type: "pipeline-start"; tasks: DashboardTask[]; phase: string }
  | { type: "pipeline-end"; phase: string; failed: string[] }
  | { type: "task-start"; taskId: string; taskName: string; startedAt: number }
  | { type: "task-end"; taskId: string; status: "complete" | "failed"; error?: string | undefined; duration?: number | undefined }
  | { type: "task-log"; taskId: string; message: string }
  | { type: "phase-change"; phase: string }
  | { type: "stats"; complete: number; running: number; pending: number; failed: number; total: number; pct: number };

export interface DashboardTask {
  id: string;
  name: string;
  status: string;
  deps: string[];
}

// ─── Dashboard Handle ───────────────────────────────────────────────────────

export interface DashboardHandle {
  url: string;
  port: number;
  emit(event: DashboardEvent): void;
  stop(): Promise<void>;
}

export interface DashboardOptions {
  port?: number;       // 0 = random (default)
  open?: boolean;      // open browser (default: true)
  host?: string;       // default: "127.0.0.1"
}

// ─── Server Implementation ──────────────────────────────────────────────────

export async function startDashboard(options: DashboardOptions = {}): Promise<DashboardHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const shouldOpen = options.open ?? true;

  const clients = new Set<ServerResponse>();
  let eventHistory: DashboardEvent[] = [];

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${host}`);

    // SSE endpoint
    if (url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Send event history to new clients
      for (const event of eventHistory) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", clients: clients.size }));
      return;
    }

    // Dashboard HTML (everything else)
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getDashboardHtml());
  });

  // Start listening
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on("error", reject);
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  const dashUrl = `http://${host}:${actualPort}`;

  // Open browser
  if (shouldOpen) {
    openBrowser(dashUrl).catch(() => {});
  }

  return {
    url: dashUrl,
    port: actualPort,
    emit(event: DashboardEvent) {
      eventHistory.push(event);
      // Cap history at 500 events
      if (eventHistory.length > 500) {
        eventHistory = eventHistory.slice(-300);
      }
      const data = `data: ${JSON.stringify(event)}\n\n`;
      for (const client of clients) {
        try { client.write(data); } catch { clients.delete(client); }
      }
    },
    async stop() {
      for (const client of clients) {
        try { client.end(); } catch {}
      }
      clients.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("node:child_process");
  const { platform } = await import("node:os");

  const cmd = platform() === "darwin"
    ? `open "${url}"`
    : platform() === "win32"
      ? `start "${url}"`
      : `xdg-open "${url}"`;

  return new Promise((resolve) => {
    exec(cmd, () => resolve());
  });
}
