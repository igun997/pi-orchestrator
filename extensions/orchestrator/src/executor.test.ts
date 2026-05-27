import { describe, expect, it } from "vitest";
import { taskToPrompt, slugFromState } from "./executor.js";
import type { RunState, Task } from "@orchestrator/shared";

function makeState(overrides: Partial<RunState> = {}): RunState {
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
    deployment: {},
    ...overrides
  };
}

function task(id: string): Task {
  return { id, name: id, status: "pending", deps: [] };
}

describe("slugFromState", () => {
  it("converts product-name to slug", () => {
    const state = makeState({ answers: { "product-name": "Acme Corp!" } });
    expect(slugFromState(state)).toBe("acme-corp");
  });

  it("defaults to 'site' when no product-name", () => {
    const state = makeState({ answers: {} });
    expect(slugFromState(state)).toBe("site");
  });
});

// =============================================
// Astro scaffold prompts
// =============================================
describe("taskToPrompt — astro-init", () => {
  it("contains @tailwindcss/vite in astro config", () => {
    const prompt = taskToPrompt(task("astro-init"), makeState(), "/tmp");
    expect(prompt).toContain("@tailwindcss/vite");
  });

  it("creates global.css with @import tailwindcss", () => {
    const prompt = taskToPrompt(task("astro-init"), makeState(), "/tmp");
    expect(prompt).toContain("src/styles/global.css");
    expect(prompt).toContain('@import "tailwindcss"');
  });

  it("imports global.css in BaseLayout.astro", () => {
    const prompt = taskToPrompt(task("astro-init"), makeState(), "/tmp");
    expect(prompt).toContain("import '../styles/global.css'");
  });

  it("sets output: 'static'", () => {
    const prompt = taskToPrompt(task("astro-init"), makeState(), "/tmp");
    expect(prompt).toContain("output: 'static'");
  });

  it("skips cloudflare when domain is none", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "astro", domain: "none" } });
    const prompt = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(prompt).not.toContain("pnpm astro add cloudflare");
  });

  it("includes cloudflare when domain set", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "astro", domain: "acme.com" } });
    const prompt = taskToPrompt(task("astro-init"), state, "/tmp");
    expect(prompt).toContain("pnpm astro add cloudflare --yes");
  });

  it("creates src/components/sections directory", () => {
    const prompt = taskToPrompt(task("astro-init"), makeState(), "/tmp");
    expect(prompt).toContain("src/components/sections");
  });
});

// =============================================
// Static HTML scaffold prompts
// =============================================
describe("taskToPrompt — static-init", () => {
  const staticState = makeState({ answers: { "product-name": "acme", framework: "static" } });

  it("installs @tailwindcss/cli", () => {
    const prompt = taskToPrompt(task("static-init"), staticState, "/tmp");
    expect(prompt).toContain("@tailwindcss/cli");
  });

  it("installs tailwindcss package", () => {
    const prompt = taskToPrompt(task("static-init"), staticState, "/tmp");
    expect(prompt).toContain("pnpm add -D tailwindcss");
  });

  it("creates src/styles/input.css with @import tailwindcss", () => {
    const prompt = taskToPrompt(task("static-init"), staticState, "/tmp");
    expect(prompt).toContain("src/styles/input.css");
    expect(prompt).toContain('@import "tailwindcss"');
  });

  it("includes @tailwindcss/browser CDN for dev", () => {
    const prompt = taskToPrompt(task("static-init"), staticState, "/tmp");
    expect(prompt).toContain("@tailwindcss/browser@4");
  });

  it("adds build script using tailwindcss CLI", () => {
    const prompt = taskToPrompt(task("static-init"), staticState, "/tmp");
    expect(prompt).toContain("tailwindcss -i src/styles/input.css -o dist/output.css --minify");
  });

  it("warns NOT to install Vite/PostCSS/webpack", () => {
    const prompt = taskToPrompt(task("static-init"), staticState, "/tmp");
    expect(prompt).toContain("Do NOT install Vite");
    expect(prompt).toContain("Do NOT create vite.config");
    expect(prompt).toContain("PostCSS");
    expect(prompt).toContain("webpack");
  });

  it("creates src/sections directory (not src/components/sections)", () => {
    const prompt = taskToPrompt(task("static-init"), staticState, "/tmp");
    expect(prompt).toContain("src/sections");
    expect(prompt).not.toContain("src/components/sections");
  });

  it("includes <!-- sections --> marker in index.html", () => {
    const prompt = taskToPrompt(task("static-init"), staticState, "/tmp");
    expect(prompt).toContain("<!-- sections -->");
  });
});

// =============================================
// craft-* prompts — framework branching
// =============================================
describe("taskToPrompt — craft tasks", () => {
  it("astro: outputs to src/components/sections/{id}.astro", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "astro" } });
    const prompt = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(prompt).toContain("src/components/sections/hero.astro");
  });

  it("static: outputs to src/sections/{id}.html", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "static" } });
    const prompt = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(prompt).toContain("src/sections/hero.html");
  });

  it("astro: includes Astro component patterns", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "astro" } });
    const prompt = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(prompt).toContain("Astro component");
    expect(prompt).toContain("src/components/ui/");
    expect(prompt).toContain("client:load");
  });

  it("static: no Astro component patterns", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "static" } });
    const prompt = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(prompt).not.toContain("Astro component");
    expect(prompt).not.toContain("client:load");
  });

  it("includes picsum seeded URLs", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "astro" } });
    const prompt = taskToPrompt(task("craft-hero"), state, "/tmp");
    expect(prompt).toContain("picsum.photos/seed/hero");
    expect(prompt).toContain("object-cover");
  });
});

// =============================================
// cf-build — framework branching
// =============================================
describe("taskToPrompt — cf-build", () => {
  it("astro: runs pnpm build", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "astro" } });
    const prompt = taskToPrompt(task("cf-build"), state, "/tmp");
    expect(prompt).toContain("pnpm build");
    expect(prompt).not.toContain("@tailwindcss/cli");
  });

  it("static: uses tailwindcss CLI to compile", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "static" } });
    const prompt = taskToPrompt(task("cf-build"), state, "/tmp");
    expect(prompt).toContain("tailwindcss -i src/styles/input.css -o dist/output.css");
    expect(prompt).toContain("--minify");
  });

  it("static: swaps CDN script for CSS link", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "static" } });
    const prompt = taskToPrompt(task("cf-build"), state, "/tmp");
    expect(prompt).toContain("Remove");
    expect(prompt).toContain("@tailwindcss/browser@4");
    expect(prompt).toContain("output.css");
  });

  it("static: copies index.html and public/ to dist/", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "static" } });
    const prompt = taskToPrompt(task("cf-build"), state, "/tmp");
    expect(prompt).toContain("cp src/index.html dist/index.html");
    expect(prompt).toContain("cp -r public/*");
  });
});

// =============================================
// assemble-page — framework branching
// =============================================
describe("taskToPrompt — assemble-page", () => {
  it("astro: imports from src/components/sections/", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "astro" } });
    const prompt = taskToPrompt(task("assemble-page"), state, "/tmp");
    expect(prompt).toContain("src/components/sections/");
    expect(prompt).toContain("index.astro");
  });

  it("static: uses merge_sections tool for src/sections/", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "static" } });
    const prompt = taskToPrompt(task("assemble-page"), state, "/tmp");
    expect(prompt).toContain("merge_sections");
    expect(prompt).toContain("src/sections/");
  });
});

// =============================================
// audit — framework branching
// =============================================
describe("taskToPrompt — audit", () => {
  it("astro: includes astro-specific checks", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "astro" } });
    const prompt = taskToPrompt(task("audit"), state, "/tmp");
    expect(prompt).toContain("Astro-specific");
    expect(prompt).toContain("astro.config.mjs");
    expect(prompt).toContain("pnpm build");
  });

  it("static: no astro checks, reads HTML files", () => {
    const state = makeState({ answers: { "product-name": "acme", framework: "static" } });
    const prompt = taskToPrompt(task("audit"), state, "/tmp");
    expect(prompt).not.toContain("Astro-specific");
    expect(prompt).toContain("HTML");
  });
});
