import { describe, expect, it } from "vitest";
import { getReadyTasks, markTaskComplete } from "./tasks.js";

describe("task graph", () => {
  const tasks = [
    { id: "a", name: "A", status: "complete" as const, deps: [] },
    { id: "b", name: "B", status: "pending" as const, deps: ["a"] },
    { id: "c", name: "C", status: "pending" as const, deps: ["b"] }
  ];

  it("returns pending tasks whose deps are complete", () => {
    expect(getReadyTasks(tasks).map((t) => t.id)).toEqual(["b"]);
  });

  it("marks task complete immutably", () => {
    const next = markTaskComplete(tasks, "b");
    expect(next.find((t) => t.id === "b")?.status).toBe("complete");
    expect(tasks.find((t) => t.id === "b")?.status).toBe("pending");
  });
});
