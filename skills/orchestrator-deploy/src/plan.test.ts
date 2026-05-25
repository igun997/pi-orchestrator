import { describe, expect, it } from "vitest";
import { planDeployTasks } from "./plan.js";

describe("planDeployTasks", () => {
  it("creates serial deploy tasks", () => {
    const tasks = planDeployTasks();
    expect(tasks.map((t) => t.id)).toEqual(["cf-build", "cf-worker-create", "cf-secrets-push", "cf-deploy"]);
    expect(tasks[1]!.deps).toEqual(["cf-build"]);
    expect(tasks[3]!.deps).toEqual(["cf-secrets-push"]);
  });

  it("adds domain-attach when custom domain provided", () => {
    const tasks = planDeployTasks("example.com");
    expect(tasks.map((t) => t.id)).toContain("cf-domain-attach");
    expect(tasks.find((t) => t.id === "cf-domain-attach")!.deps).toEqual(["cf-deploy"]);
  });

  it("skips domain-attach for workers.dev", () => {
    const tasks = planDeployTasks("workers.dev");
    expect(tasks.map((t) => t.id)).not.toContain("cf-domain-attach");
  });
});
