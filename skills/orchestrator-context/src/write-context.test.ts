import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialState, saveState, statePaths } from "@orchestrator/shared";
import { describe, expect, it } from "vitest";
import { writeContext } from "./write-context.js";

describe("writeContext", () => {
  it("writes product and design context files from answers and specs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-context-"));
    const state = createInitialState({ targetDir: dir });
    state.answers = {
      "product-name": "Acme Launch",
      "target-users": "Design-led founders",
      tone: "Confident and crisp",
      "anti-references": "Generic SaaS gradients",
      register: "premium editorial"
    };
    await saveState(dir, state);

    const paths = statePaths(dir);
    await writeFile(
      join(paths.specs, "design-system.json"),
      JSON.stringify({
        colors: {
          primary: "oklch(62% 0.18 260)",
          secondary: "oklch(78% 0.12 180)",
          accent: "oklch(70% 0.2 40)",
          neutrals: ["oklch(98% 0.01 260)", "oklch(20% 0.02 260)"],
          semantic: {
            success: "oklch(65% 0.16 145)",
            warn: "oklch(75% 0.18 80)",
            error: "oklch(62% 0.2 25)",
            info: "oklch(65% 0.14 240)"
          }
        },
        typography: {
          fontFamilies: { display: "Inter Display", body: "Inter", mono: "JetBrains Mono" },
          scale: ["0.875rem", "1rem", "1.25rem"],
          weights: [400, 600, 800]
        },
        spacing: { unit: "4px", scale: ["4px", "8px", "16px"] },
        radii: ["8px", "16px"],
        shadows: ["0 12px 40px oklch(0% 0 0 / 0.18)"],
        borders: [],
        components: [{ name: "Hero card", variants: ["featured"], states: ["hover"] }]
      }),
      "utf8"
    );
    await writeFile(
      join(paths.specs, "page-spec.json"),
      JSON.stringify({
        meta: { inferredPageType: "landing" },
        layout: { grid: "12-column", breakpoints: ["sm", "lg"], container: "max-w-6xl" },
        sections: [
          { id: "hero", kind: "hero", order: 0, content: { headline: "Ship faster" }, components: ["Hero card"], notes: ["Strong contrast"] }
        ]
      }),
      "utf8"
    );

    await writeContext(dir);

    const product = await readFile(join(dir, "PRODUCT.md"), "utf8");
    expect(product).toContain("register:");
    expect(product).toContain("Acme Launch");

    const design = await readFile(join(dir, "DESIGN.md"), "utf8");
    expect(design).toContain("oklch(62% 0.18 260)");
    expect(design).toContain("Inter Display");
    expect(design).toContain("JetBrains Mono");
  });
});
