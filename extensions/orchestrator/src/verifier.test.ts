import { describe, expect, it } from "vitest";
import { verifyTasks, type VerifyOptions } from "./verifier.js";
import type { Task } from "@orchestrator/shared";

describe("verifyTasks", () => {
  const fileExists = (path: string) => Promise.resolve(path.includes("hero"));
  const staticOpts: VerifyOptions = { projectDir: "/tmp/site", outputMode: "static" };
  const astroStaticOpts: VerifyOptions = { projectDir: "/tmp/site", outputMode: "astro-static" };
  const astroServerOpts: VerifyOptions = { projectDir: "/tmp/site", outputMode: "astro-server" };

  // === craft paths ===
  it("astro-static: craft checks src/components/sections/*.astro", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    await verifyTasks([{ id: "craft-hero", name: "Craft hero", status: "complete", deps: [] }], astroStaticOpts, spy);
    expect(checked[0]).toBe("/tmp/site/src/components/sections/hero.astro");
  });

  it("astro-server: craft checks src/components/sections/*.astro", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    await verifyTasks([{ id: "craft-hero", name: "Craft hero", status: "complete", deps: [] }], astroServerOpts, spy);
    expect(checked[0]).toBe("/tmp/site/src/components/sections/hero.astro");
  });

  it("static: craft checks src/sections/*.html", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    await verifyTasks([{ id: "craft-hero", name: "Craft hero", status: "complete", deps: [] }], staticOpts, spy);
    expect(checked[0]).toBe("/tmp/site/src/sections/hero.html");
  });

  // === assemble-page paths ===
  it("astro-static: assemble checks src/pages/index.astro", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    await verifyTasks([{ id: "assemble-page", name: "Assemble", status: "complete", deps: [] }], astroStaticOpts, spy);
    expect(checked[0]).toBe("/tmp/site/src/pages/index.astro");
  });

  it("static: assemble checks src/index.html", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    await verifyTasks([{ id: "assemble-page", name: "Assemble", status: "complete", deps: [] }], staticOpts, spy);
    expect(checked[0]).toBe("/tmp/site/src/index.html");
  });

  // === cf-build dist artifacts ===
  it("astro-static: cf-build checks dist/index.html", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    await verifyTasks([{ id: "cf-build", name: "Build", status: "complete", deps: [] }], astroStaticOpts, spy);
    expect(checked[0]).toBe("/tmp/site/dist/index.html");
  });

  it("astro-server: cf-build checks dist/_worker.js", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    await verifyTasks([{ id: "cf-build", name: "Build", status: "complete", deps: [] }], astroServerOpts, spy);
    expect(checked[0]).toBe("/tmp/site/dist/_worker.js");
  });

  it("static: cf-build checks dist/index.html", async () => {
    const checked: string[] = [];
    const spy = (path: string) => { checked.push(path); return Promise.resolve(true); };
    await verifyTasks([{ id: "cf-build", name: "Build", status: "complete", deps: [] }], staticOpts, spy);
    expect(checked[0]).toBe("/tmp/site/dist/index.html");
  });

  // === general behavior ===
  it("keeps complete task when file exists", async () => {
    const result = await verifyTasks(
      [{ id: "craft-hero", name: "Craft hero", status: "complete", deps: [] }],
      astroStaticOpts, fileExists
    );
    expect(result[0]!.status).toBe("complete");
  });

  it("marks complete task pending when file missing", async () => {
    const result = await verifyTasks(
      [{ id: "craft-pricing", name: "Craft pricing", status: "complete", deps: [] }],
      astroStaticOpts, fileExists
    );
    expect(result[0]!.status).toBe("pending");
  });

  it("always marks deploy tasks pending", async () => {
    const result = await verifyTasks(
      [{ id: "cf-deploy", name: "Deploy", status: "complete", deps: [] }],
      astroStaticOpts, fileExists
    );
    expect(result[0]!.status).toBe("pending");
  });

  it("leaves pending tasks unchanged", async () => {
    const result = await verifyTasks(
      [{ id: "craft-hero", name: "Craft hero", status: "pending", deps: [] }],
      astroStaticOpts, fileExists
    );
    expect(result[0]!.status).toBe("pending");
  });
});
