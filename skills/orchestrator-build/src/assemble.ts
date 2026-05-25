export function assemblePage(sections: { id: string }[]): string {
  const imports = sections
    .map((s) => {
      const name = s.id.charAt(0).toUpperCase() + s.id.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return `import ${name} from "../components/${s.id}.astro";`;
    })
    .join("\n");

  const components = sections
    .map((s) => {
      const name = s.id.charAt(0).toUpperCase() + s.id.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return `  <${name} />`;
    })
    .join("\n");

  return `---\n${imports}\n---\n<main>\n${components}\n</main>\n`;
}
