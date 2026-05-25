const componentMap = new Map<string, string>([
  ["button", "button"],
  ["textinput", "input"],
  ["card", "card"]
]);

export function mapComponentsToShadcn(components: { name: string }[]): string[] {
  const registryNames = new Set<string>();

  for (const component of components) {
    const registryName = componentMap.get(component.name.toLowerCase());
    if (registryName) registryNames.add(registryName);
  }

  return [...registryNames];
}
