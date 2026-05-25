import { describe, expect, it, vi } from "vitest";
import { maybeAutoHeal } from "./auto-heal.js";

describe("maybeAutoHeal", () => {
  it("returns skipped when autoHeal disabled", async () => {
    const dispatch = vi.fn();
    const result = await maybeAutoHeal({ autoHeal: false, taskId: "craft-hero", errorRef: "logs/craft-hero.log", healedTasks: new Set(), dispatch });
    expect(result).toBe("skipped");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("returns skipped when task already healed", async () => {
    const dispatch = vi.fn();
    const result = await maybeAutoHeal({ autoHeal: true, taskId: "craft-hero", errorRef: "logs/craft-hero.log", healedTasks: new Set(["craft-hero"]), dispatch });
    expect(result).toBe("skipped");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches debug and returns healed when enabled", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const healedTasks = new Set<string>();
    const result = await maybeAutoHeal({ autoHeal: true, taskId: "craft-hero", errorRef: "logs/craft-hero.log", healedTasks, dispatch });
    expect(result).toBe("healed");
    expect(dispatch).toHaveBeenCalledOnce();
    expect(healedTasks.has("craft-hero")).toBe(true);
  });
});
