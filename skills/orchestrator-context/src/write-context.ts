import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DesignSystemSchema, loadState, PageSpecSchema, statePaths } from "@orchestrator/shared";

function answerValue(answers: Record<string, unknown>, key: string): string {
  const value = answers[key];
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (Array.isArray(value) && value.length > 0) return value.map(String).join(", ");
  return "(unset)";
}

function listItems(values: unknown[]): string {
  if (values.length === 0) return "- (none)";
  return values.map((value) => `- ${String(value)}`).join("\n");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeContext(targetDir: string): Promise<void> {
  const state = await loadState(targetDir);
  const paths = statePaths(targetDir);
  const designSystem = DesignSystemSchema.parse(await readJson(join(paths.specs, "design-system.json")));
  const pageSpec = PageSpecSchema.parse(await readJson(join(paths.specs, "page-spec.json")));

  const productName = answerValue(state.answers, "product-name");
  const register = answerValue(state.answers, "register");
  const users = answerValue(state.answers, "target-users");
  const purpose = answerValue(state.answers, "product-purpose");
  const tone = answerValue(state.answers, "tone");
  const antiReferences = answerValue(state.answers, "anti-references");

  const productMarkdown = `# PRODUCT.md

## Product Name
${productName}

## register:
${register}

## Users
${users}

## Product Purpose
${purpose}

## Tone
${tone}

## Anti-references
${antiReferences}
`;

  const semanticColors = Object.entries(designSystem.colors.semantic).map(([name, color]) => `- ${name}: ${color}`);
  const componentLines = designSystem.components.map((component) => {
    const details = [
      component.variants.length > 0 ? `variants: ${component.variants.join(", ")}` : undefined,
      component.states.length > 0 ? `states: ${component.states.join(", ")}` : undefined
    ].filter(Boolean);
    return `- ${component.name}${details.length > 0 ? ` (${details.join("; ")})` : ""}`;
  });
  const sectionLines = pageSpec.sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const components = section.components.length > 0 ? `; components: ${section.components.join(", ")}` : "";
      const notes = section.notes.length > 0 ? `; notes: ${section.notes.join(", ")}` : "";
      return `- ${section.id}: ${section.kind} (order ${section.order}${components}${notes})`;
    });

  const designMarkdown = `# DESIGN.md

## Colors (OKLCH tokens)
- primary: ${designSystem.colors.primary}
- secondary: ${designSystem.colors.secondary}
- accent: ${designSystem.colors.accent}
- neutrals: ${designSystem.colors.neutrals.join(", ")}
${semanticColors.join("\n")}

## Typography
- display: ${designSystem.typography.fontFamilies.display}
- body: ${designSystem.typography.fontFamilies.body}
- mono: ${designSystem.typography.fontFamilies.mono}
- scale: ${designSystem.typography.scale.join(", ")}
- weights: ${designSystem.typography.weights.join(", ")}

## Spacing
- unit: ${designSystem.spacing.unit}
- scale: ${designSystem.spacing.scale.join(", ")}

## Radii
${listItems(designSystem.radii)}

## Shadows
${listItems(designSystem.shadows)}

## Components inventory
${listItems(componentLines)}

## Page sections
${listItems(sectionLines)}
`;

  await Promise.all([
    writeFile(join(targetDir, "PRODUCT.md"), productMarkdown, "utf8"),
    writeFile(join(targetDir, "DESIGN.md"), designMarkdown, "utf8")
  ]);
}
