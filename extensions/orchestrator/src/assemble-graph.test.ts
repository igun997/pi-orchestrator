import { describe, expect, it } from "vitest";
import { assembleTaskGraph } from "./assemble-graph.js";

describe("assembleTaskGraph", () => {
  it("assembles full graph with supabase when backend is contact-form (astro)", () => {
    const tasks = assembleTaskGraph({
      targetDir: "/tmp/site",
      framework: "astro",
      backend: "contact-form",
      domain: "workers.dev",
      sections: [{ id: "hero", kind: "hero" }, { id: "pricing", kind: "pricing" }]
    });

    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("astro-init");
    expect(ids).toContain("supabase-provision");
    expect(ids).toContain("shadcn-init");
    expect(ids).toContain("write-context");
    expect(ids).toContain("wire-supabase");
    expect(ids).toContain("impeccable-shape");
    expect(ids).toContain("craft-hero");
    expect(ids).toContain("craft-pricing");
    expect(ids).toContain("assemble-page");
    expect(ids).toContain("polish");
    expect(ids).toContain("audit");
    expect(ids).toContain("cf-build");
    expect(ids).toContain("cf-deploy");
    expect(ids).not.toContain("cf-domain-attach");
  });

  it("skips supabase when backend is none", () => {
    const tasks = assembleTaskGraph({
      targetDir: "/tmp/site",
      framework: "astro",
      backend: "none",
      domain: "workers.dev",
      sections: [{ id: "hero", kind: "hero" }]
    });

    const ids = tasks.map((t) => t.id);
    expect(ids).not.toContain("supabase-provision");
    expect(ids).not.toContain("wire-supabase");
  });

  it("adds domain-attach for custom domain", () => {
    const tasks = assembleTaskGraph({
      targetDir: "/tmp/site",
      framework: "astro",
      backend: "none",
      domain: "example.com",
      sections: [{ id: "hero", kind: "hero" }]
    });

    expect(tasks.map((t) => t.id)).toContain("cf-domain-attach");
  });

  it("build tasks depend on scaffold tasks", () => {
    const tasks = assembleTaskGraph({
      targetDir: "/tmp/site",
      framework: "astro",
      backend: "none",
      domain: "workers.dev",
      sections: [{ id: "hero", kind: "hero" }]
    });

    const shape = tasks.find((t) => t.id === "impeccable-shape");
    expect(shape!.deps).toContain("astro-init");
    expect(shape!.deps).toContain("write-context");
  });

  it("deploy depends on audit", () => {
    const tasks = assembleTaskGraph({
      targetDir: "/tmp/site",
      framework: "astro",
      backend: "none",
      domain: "workers.dev",
      sections: [{ id: "hero", kind: "hero" }]
    });

    const cfBuild = tasks.find((t) => t.id === "cf-build");
    expect(cfBuild!.deps).toContain("audit");
  });

  it("static framework skips astro-init and shadcn-init", () => {
    const tasks = assembleTaskGraph({
      targetDir: "/tmp/site",
      framework: "static",
      backend: "none",
      domain: "workers.dev",
      sections: [{ id: "hero", kind: "hero" }]
    });

    const ids = tasks.map((t) => t.id);
    expect(ids).not.toContain("astro-init");
    expect(ids).not.toContain("shadcn-init");
    expect(ids).toContain("write-context");
    expect(ids).toContain("impeccable-shape");
    expect(ids).toContain("cf-build");
  });

  it("static with backend has no wire-supabase", () => {
    const tasks = assembleTaskGraph({
      targetDir: "/tmp/site",
      framework: "static",
      backend: "contact-form",
      domain: "workers.dev",
      sections: [{ id: "hero", kind: "hero" }]
    });

    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("supabase-provision");
    expect(ids).not.toContain("wire-supabase");
  });
});
