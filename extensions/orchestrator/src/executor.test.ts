import { describe, expect, it } from "vitest";
import { taskToPrompt, slugFromState } from "./executor.js";
import type { RunState, Task } from "@orchestrator/shared";

function makeState(overrides: Partial<RunState> & { answers?: Record<string, unknown> } = {}): RunState {
  return {
    runId: "test",
    createdAt: "now",
    phase: "scaffolding",
    inputs: {},
    specs: {},
    answers: { "product-name": "acme", framework: "astro", "backend-level": "none" },
    confirmed: true,
    tasks: [],
    stack: {},
    config: { autoHeal: false, maxParallelImpeccable: 3 },
    options: { dashboard: false },
    deployment: {},
    ...overrides
  };
}

function task(id: string): Task {
  return { id, name: id, status: "pending", deps: [] };
}

describe("slugFromState", () => {
  it("converts product-name to slug", () => {
    expect(slugFromState(makeState({ answers: { "product-name": "Acme Corp!" } }))).toBe("acme-corp");
  });

  it("defaults to 'site' when no product-name", () => {
    expect(slugFromState(makeState({ answers: {} }))).toBe("site");
  });
});

// =============================================
// Astro STATIC (SSG) — backend: none
// =============================================
describe("astro-static mode (backend=none)", () => {
  const state = makeState({ answers: { "product-name": "acme", framework: "astro", "backend-level": "none" } });

  it("astro-init: output 'static'", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("output: 'static'");
    expect(p).not.toContain("output: 'server'");
  });

  it("astro-init: no cloudflare adapter when domain=none", () => {
    const s = makeState({ answers: { ...state.answers, domain: "none" } });
    const p = taskToPrompt(task("astro-init"), s, "/tmp");
    expect(p).not.toContain("@astrojs/cloudflare");
    expect(p).not.toContain("adapter:");
  });

  it("astro-init: global.css with @import tailwindcss", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("src/styles/global.css");
    expect(p).toContain('@import "tailwindcss"');
    expect(p).toContain("import '../styles/global.css'");
  });

  it("astro-init: @tailwindcss/vite plugin", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("@tailwindcss/vite");
  });

  it("astro-init: MODE RULES say astro-static", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("MODE RULES (astro-static)");
    expect(p).toContain("STATIC generation (SSG)");
  });

  it("craft: outputs to src/components/sections/*.astro", () => {
    const p = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(p).toContain("src/components/sections/hero.astro");
  });

  it("craft: MODE RULES say astro-static", () => {
    const p = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(p).toContain("MODE RULES (astro-static)");
    expect(p).toContain("pre-rendered at build time");
  });

  it("cf-build: pnpm build, check dist/index.html", () => {
    const p = taskToPrompt(task("cf-build"), state, "/tmp");
    expect(p).toContain("pnpm build");
    expect(p).toContain("dist/index.html");
    expect(p).not.toContain("_worker.js");
  });

  it("audit: SSG checks, no SSR checks", () => {
    const p = taskToPrompt(task("audit"), state, "/tmp");
    expect(p).toContain("SSG mode checks");
    expect(p).toContain("dist/index.html");
    expect(p).not.toContain("SSR mode");
    expect(p).not.toContain("_worker.js");
  });

  it("assemble-page: imports from src/components/sections/", () => {
    const p = taskToPrompt(task("assemble-page"), state, "/tmp");
    expect(p).toContain("src/components/sections/");
    expect(p).toContain("index.astro");
  });
});

// =============================================
// Astro SERVER (SSR) — backend: auth
// =============================================
describe("astro-server mode (backend=auth)", () => {
  const state = makeState({ answers: { "product-name": "acme", framework: "astro", "backend-level": "auth" } });

  it("astro-init: output 'server'", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("output: 'server'");
    expect(p).not.toContain("output: 'static'");
  });

  it("astro-init: cloudflare adapter always (SSR needs it)", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("@astrojs/cloudflare");
    expect(p).toContain("adapter: cloudflare()");
    expect(p).toContain("pnpm astro add cloudflare");
  });

  it("astro-init: MODE RULES say astro-server", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("MODE RULES (astro-server)");
    expect(p).toContain("SERVER rendering (SSR)");
  });

  it("craft: MODE RULES say astro-server", () => {
    const p = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(p).toContain("MODE RULES (astro-server)");
    expect(p).toContain("Server-side code allowed");
  });

  it("cf-build: pnpm build, check dist/_worker.js", () => {
    const p = taskToPrompt(task("cf-build"), state, "/tmp");
    expect(p).toContain("pnpm build");
    expect(p).toContain("dist/_worker.js");
  });

  it("audit: SSR checks", () => {
    const p = taskToPrompt(task("audit"), state, "/tmp");
    expect(p).toContain("SSR mode checks");
    expect(p).toContain("dist/_worker.js");
    expect(p).toContain("output: 'server'");
  });
});

// =============================================
// Astro SERVER (SSR) — backend: cms
// =============================================
describe("astro-server mode (backend=cms)", () => {
  const state = makeState({ answers: { "product-name": "acme", framework: "astro", "backend-level": "cms" } });

  it("astro-init: output 'server' for cms too", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("output: 'server'");
    expect(p).toContain("adapter: cloudflare()");
  });
});

// =============================================
// Astro STATIC with contact-form (still SSG)
// =============================================
describe("astro-static mode (backend=contact-form)", () => {
  const state = makeState({ answers: { "product-name": "acme", framework: "astro", "backend-level": "contact-form" } });

  it("astro-init: stays static (contact-form is client-side)", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("output: 'static'");
    expect(p).not.toContain("output: 'server'");
  });

  it("MODE RULES say astro-static", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("MODE RULES (astro-static)");
  });
});

// =============================================
// Astro STATIC with deploy domain (gets CF adapter)
// =============================================
describe("astro-static with deploy domain", () => {
  const state = makeState({ answers: { "product-name": "acme", framework: "astro", "backend-level": "none", domain: "acme.com" } });

  it("astro-init: includes cloudflare for deploy, but stays static", () => {
    const p = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(p).toContain("output: 'static'");
    expect(p).toContain("pnpm astro add cloudflare");
  });
});

// =============================================
// STATIC HTML (zero npm, CDN only)
// =============================================
describe("static mode (zero npm)", () => {
  const state = makeState({ answers: { "product-name": "acme", framework: "static", "backend-level": "none" } });

  it("static-init: no npm commands", () => {
    const p = taskToPrompt(task("static-init"), state, "/tmp");
    expect(p).not.toContain("pnpm init");
    expect(p).not.toContain("pnpm add");
    expect(p).not.toContain("npm install");
    // MODE RULES mention "No package.json" as prohibition — that's correct
    // Just ensure no npm setup commands exist
    expect(p).not.toContain("pnpm create");
  });

  it("static-init: uses CDN script tag", () => {
    const p = taskToPrompt(task("static-init"), state, "/tmp");
    expect(p).toContain("@tailwindcss/browser@4");
  });

  it("static-init: no build tools", () => {
    const p = taskToPrompt(task("static-init"), state, "/tmp");
    expect(p).toContain("No Vite");
    expect(p).toContain("no PostCSS");
    expect(p).toContain("No @tailwindcss/cli");
    expect(p).toContain("No build step");
  });

  it("static-init: MODE RULES say static", () => {
    const p = taskToPrompt(task("static-init"), state, "/tmp");
    expect(p).toContain("MODE RULES (static)");
    expect(p).toContain("PURE STATIC HTML");
    expect(p).toContain("Zero npm");
  });

  it("static-init: creates src/sections dir (not src/components/sections)", () => {
    const p = taskToPrompt(task("static-init"), state, "/tmp");
    expect(p).toContain("src/sections");
    expect(p).not.toContain("src/components/sections");
  });

  it("craft: outputs to src/sections/*.html", () => {
    const p = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(p).toContain("src/sections/hero.html");
  });

  it("craft: MODE RULES say static, no import statements", () => {
    const p = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(p).toContain("MODE RULES (static)");
    expect(p).toContain("No npm");
    expect(p).toContain("plain HTML snippet");
  });

  it("cf-build: no build step, just copy", () => {
    const p = taskToPrompt(task("cf-build"), state, "/tmp");
    expect(p).toContain("cp src/index.html dist/index.html");
    expect(p).toContain("No build step");
    expect(p).not.toContain("pnpm build");
    expect(p).not.toContain("tailwindcss -i");
  });

  it("audit: static HTML checks, no npm", () => {
    const p = taskToPrompt(task("audit"), state, "/tmp");
    expect(p).toContain("Static HTML mode checks");
    expect(p).toContain("NO npm packages");
    expect(p).toContain("@tailwindcss/browser@4");
  });

  it("assemble-page: uses merge_sections tool", () => {
    const p = taskToPrompt(task("assemble-page"), state, "/tmp");
    expect(p).toContain("merge_sections");
    expect(p).toContain("src/sections/");
  });

  it("picsum URLs present in craft", () => {
    const p = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(p).toContain("picsum.photos/seed/hero");
    expect(p).toContain("object-cover");
  });
});
