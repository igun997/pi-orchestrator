import { describe, expect, it, afterEach } from "vitest";
import { startDashboard, type DashboardHandle } from "./dashboard.js";

describe("dashboard", () => {
  let dash: DashboardHandle | undefined;

  afterEach(async () => {
    if (dash) {
      await dash.stop();
      dash = undefined;
    }
  });

  it("starts on random port and serves HTML", async () => {
    dash = await startDashboard({ open: false, port: 0 });
    expect(dash.port).toBeGreaterThan(0);
    expect(dash.url).toContain("127.0.0.1");

    const res = await fetch(dash.url);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Orchestrator");
    expect(html).toContain("EventSource");
  });

  it("serves health endpoint", async () => {
    dash = await startDashboard({ open: false, port: 0 });
    const res = await fetch(`${dash.url}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });

  it("streams SSE events to connected clients", async () => {
    dash = await startDashboard({ open: false, port: 0 });

    // Connect SSE client
    const events: any[] = [];
    const controller = new AbortController();
    const ssePromise = fetch(`${dash.url}/events`, { signal: controller.signal })
      .then(async (res) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop()!;
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              events.push(JSON.parse(line.slice(6)));
            }
          }
        }
      })
      .catch(() => {});

    // Wait for connection
    await new Promise((r) => setTimeout(r, 50));

    // Emit events
    dash.emit({ type: "task-start", taskId: "hero", taskName: "Craft hero", startedAt: Date.now() });
    dash.emit({ type: "task-end", taskId: "hero", status: "complete", duration: 5000 });

    // Wait for delivery
    await new Promise((r) => setTimeout(r, 50));
    controller.abort();
    await ssePromise;

    expect(events.length).toBe(2);
    expect(events[0].type).toBe("task-start");
    expect(events[1].type).toBe("task-end");
    expect(events[1].status).toBe("complete");
  });

  it("replays event history to new clients", async () => {
    dash = await startDashboard({ open: false, port: 0 });

    // Emit before any client connects
    dash.emit({ type: "phase-change", phase: "building" });

    // Connect after emit
    const events: any[] = [];
    const controller = new AbortController();
    const ssePromise = fetch(`${dash.url}/events`, { signal: controller.signal })
      .then(async (res) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop()!;
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              events.push(JSON.parse(line.slice(6)));
            }
          }
        }
      })
      .catch(() => {});

    await new Promise((r) => setTimeout(r, 50));
    controller.abort();
    await ssePromise;

    expect(events.length).toBe(1);
    expect(events[0].phase).toBe("building");
  });
});
