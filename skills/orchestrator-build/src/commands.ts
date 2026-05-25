export function buildCommands(sections: { id: string; kind: string }[]): Record<string, string> {
  const cmds: Record<string, string> = {
    "impeccable-shape": `npx impeccable shape "site layout"`
  };

  for (const section of sections) {
    cmds[`craft-${section.id}`] = `npx impeccable craft "${section.id}: ${section.kind}"`;
  }

  cmds["assemble-page"] = "# assembled programmatically";
  cmds["polish"] = "npx impeccable polish src/pages/index.astro";
  cmds["audit"] = "npx impeccable audit src/pages/index.astro";

  return cmds;
}
