import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInitialState } from "@orchestrator/shared";
import type { Task } from "@orchestrator/shared";

// Mock the entire pi-coding-agent module
vi.mock("@earendil-works/pi-coding-agent", () => {
  const mockReload = vi.fn();
  return {
    createAgentSession: vi.fn(),
    DefaultResourceLoader: vi.fn().mockImplementation(() => ({ reload: mockReload })),
    SessionManager: { inMemory: vi.fn(() => ({})) },
    SettingsManager: { inMemory: vi.fn(() => ({})) },
  };
});

function makeTask(id: string): Task {
  return { id, name: `Task ${id}`, status: "running" as const, deps: [] };
}

function makeState() {
  const state = createInitialState({ targetDir: "/tmp/test" });
  state.answers = { framework: "static", "backend-level": "none", "product-name": "test" };
  state.confirmed = true;
  return state;
}

function makeOptions() {
  return {
    model: { id: "test-model", provider: "test" } as any,
    modelRegistry: { authStorage: {} } as any,
    cwd: "/tmp/test",
    onProgress: vi.fn(),
  };
}

describe("spawnTaskAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns complete on successful prompt", async () => {
    const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
    const mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    (createAgentSession as any).mockResolvedValue({ 
      session: mockSession, 
      extensionsResult: { extensions: [], errors: [], runtime: {} } 
    });

    const { spawnTaskAgent } = await import("./subagent.js");
    const result = await spawnTaskAgent(makeTask("static-init"), makeState(), "/tmp/test", makeOptions());
    
    expect(result.status).toBe("complete");
    expect(result.taskId).toBe("static-init");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockSession.prompt).toHaveBeenCalledOnce();
    expect(mockSession.dispose).toHaveBeenCalledOnce();
  });

  it("returns failed when prompt throws", async () => {
    const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
    const mockSession = {
      prompt: vi.fn().mockRejectedValue(new Error("LLM timeout")),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    (createAgentSession as any).mockResolvedValue({ 
      session: mockSession, 
      extensionsResult: { extensions: [], errors: [], runtime: {} } 
    });

    const { spawnTaskAgent } = await import("./subagent.js");
    const result = await spawnTaskAgent(makeTask("craft-hero"), makeState(), "/tmp/test", makeOptions());
    
    expect(result.status).toBe("failed");
    expect(result.error).toContain("LLM timeout");
    expect(mockSession.dispose).toHaveBeenCalledOnce();
  });

  it("always disposes session even on error", async () => {
    const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
    const mockSession = {
      prompt: vi.fn().mockRejectedValue(new Error("boom")),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    (createAgentSession as any).mockResolvedValue({ 
      session: mockSession, 
      extensionsResult: { extensions: [], errors: [], runtime: {} } 
    });

    const { spawnTaskAgent } = await import("./subagent.js");
    await spawnTaskAgent(makeTask("audit"), makeState(), "/tmp/test", makeOptions());
    expect(mockSession.dispose).toHaveBeenCalledOnce();
  });

  it("calls onProgress callbacks", async () => {
    const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
    const mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    (createAgentSession as any).mockResolvedValue({ 
      session: mockSession, 
      extensionsResult: { extensions: [], errors: [], runtime: {} } 
    });

    const opts = makeOptions();
    const { spawnTaskAgent } = await import("./subagent.js");
    await spawnTaskAgent(makeTask("static-init"), makeState(), "/tmp/test", opts);
    
    expect(opts.onProgress).toHaveBeenCalledWith(expect.stringContaining("static-init"));
    // Should be called at least twice (start + end)
    expect(opts.onProgress).toHaveBeenCalledTimes(2);
  });
});
