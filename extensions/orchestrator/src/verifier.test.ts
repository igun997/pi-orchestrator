import { describe, expect, it } from "vitest";
import { verifyTasks, type VerifyOptions } from "./verifier.js";
import type { Task } from "@orchestrator/shared";

describe("verifyTasks", () => {
  const fileExists = (path: string) => Promise.resolve(path.includes("hero"));
  const astroOpts: VerifyOptions = { projectDir: "/tmp/site", framework: "astro" };
  const staticOpts: VerifyOptions = { projectDir: "/tmp/site", framework: "static" };

  it("keeps complete task when file exists (astro)", async () => {
    const tasks: Task[] = [{ id: "craft-hero", name: "Craft hero", status: "complete", deps: [] }];
    const result = await verifyTasks(tasks, astroOpts, fileExists);
    expect(result.find((t) => t.id === "craft-hero")!.status).toBe("complete");
  });

  it("checks correct astro path: src/components/sections/", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    const tasks: Task[] = [{ id: "craft-hero", name: "Craft hero", status: "complete", deps: [] }];
    await verifyTasks(tasks, astroOpts, spy);
    expect(checked[0]).toBe("/tmp/site/src/components/sections/hero.astro");
  });

  it("checks correct static path: src/sections/", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    const tasks: Task[] = [{ id: "craft-hero", name: "Craft hero", status: "complete", deps: [] }];
    await verifyTasks(tasks, staticOpts, spy);
    expect(checked[0]).toBe("/tmp/site/src/sections/hero.html");
  });

  it("marks complete task pending when file missing", async () => {
    const tasks: Task[] = [{ id: "craft-pricing", name: "Craft pricing", status: "complete", deps: [] }];
    const result = await verifyTasks(tasks, astroOpts, fileExists);
    expect(result.find((t) => t.id === "craft-pricing")!.status).toBe("pending");
  });

  it("always marks deploy tasks pending", async () => {
    const tasks: Task[] = [{ id: "cf-deploy", name: "Deploy", status: "complete", deps: [] }];
    const result = await verifyTasks(tasks, astroOpts, fileExists);
    expect(result.find((t) => t.id === "cf-deploy")!.status).toBe("pending");
  });

  it("leaves pending tasks unchanged", async () => {
    const tasks: Task[] = [{ id: "craft-hero", name: "Craft hero", status: "pending", deps: [] }];
    const result = await verifyTasks(tasks, astroOpts, fileExists);
    expect(result.find((t) => t.id === "craft-hero")!.status).toBe("pending");
  });

  it("checks static assemble-page at src/index.html", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    const tasks: Task[] = [{ id: "assemble-page", name: "Assemble", status: "complete", deps: [] }];
    await verifyTasks(tasks, staticOpts, spy);
    expect(checked[0]).toBe("/tmp/site/src/index.html");
  });
});
