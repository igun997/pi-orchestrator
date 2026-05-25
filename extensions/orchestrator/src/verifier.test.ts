import { describe, expect, it } from "vitest";
import { verifyTasks } from "./verifier.js";
import type { Task } from "@orchestrator/shared";

describe("verifyTasks", () => {
  const fileExists = (path: string) => Promise.resolve(path.includes("hero"));

  it("keeps complete task when file exists", async () => {
    const tasks: Task[] = [{ id: "craft-hero", name: "Craft hero", status: "complete", deps: [] }];
    const result = await verifyTasks(tasks, "/tmp/site", fileExists);
    expect(result.find((t) => t.id === "craft-hero")!.status).toBe("complete");
  });

  it("marks complete task pending when file missing", async () => {
    const tasks: Task[] = [{ id: "craft-pricing", name: "Craft pricing", status: "complete", deps: [] }];
    const result = await verifyTasks(tasks, "/tmp/site", fileExists);
    expect(result.find((t) => t.id === "craft-pricing")!.status).toBe("pending");
  });

  it("always marks deploy tasks pending", async () => {
    const tasks: Task[] = [{ id: "cf-deploy", name: "Deploy", status: "complete", deps: [] }];
    const result = await verifyTasks(tasks, "/tmp/site", fileExists);
    expect(result.find((t) => t.id === "cf-deploy")!.status).toBe("pending");
  });

  it("leaves pending tasks unchanged", async () => {
    const tasks: Task[] = [{ id: "craft-hero", name: "Craft hero", status: "pending", deps: [] }];
    const result = await verifyTasks(tasks, "/tmp/site", fileExists);
    expect(result.find((t) => t.id === "craft-hero")!.status).toBe("pending");
  });
});
