import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

/**
 * Merge section HTML files into a single index.html.
 * Reads sections from src/sections/ in order specified by page-spec.json,
 * injects them into the base index.html template.
 */
export async function mergeSections(projectDir: string, specsDir: string): Promise<{ merged: string; sections: string[] }> {
  const sectionsDir = join(projectDir, "src/sections");
  const indexPath = join(projectDir, "src/index.html");
  const specPath = join(specsDir, "page-spec.json");

  // Read page-spec for section order
  let sectionOrder: string[] = [];
  if (existsSync(specPath)) {
    const spec = JSON.parse(await readFile(specPath, "utf8"));
    sectionOrder = (spec.sections ?? []).map((s: { id: string }) => s.id);
  }

  // Read available section files
  if (!existsSync(sectionsDir)) {
    throw new Error(`Sections directory not found: ${sectionsDir}`);
  }

  const files = await readdir(sectionsDir);
  const htmlFiles = files.filter((f) => f.endsWith(".html"));

  // Sort by spec order, fallback to alphabetical
  const sorted = htmlFiles.sort((a, b) => {
    const aId = a.replace(".html", "");
    const bId = b.replace(".html", "");
    const aIdx = sectionOrder.indexOf(aId);
    const bIdx = sectionOrder.indexOf(bId);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  // Read all section contents
  const sectionContents: string[] = [];
  for (const file of sorted) {
    const content = await readFile(join(sectionsDir, file), "utf8");
    sectionContents.push(`<!-- section: ${file.replace(".html", "")} -->\n${content.trim()}`);
  }

  const mergedSections = sectionContents.join("\n\n");

  // Read base index.html and inject sections
  if (existsSync(indexPath)) {
    let base = await readFile(indexPath, "utf8");

    // Replace body content or append before </body>
    if (base.includes("<!-- sections -->")) {
      base = base.replace("<!-- sections -->", mergedSections);
    } else if (base.includes("</body>")) {
      base = base.replace("</body>", `  ${mergedSections}\n</body>`);
    } else {
      base = base + "\n" + mergedSections;
    }

    await writeFile(indexPath, base);
  } else {
    // No base template — create full page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="antialiased">
${mergedSections}
</body>
</html>`;
    await writeFile(indexPath, html);
  }

  return { merged: indexPath, sections: sorted.map((f) => f.replace(".html", "")) };
}
