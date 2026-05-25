export function designSystemPrompt(): string {
  return [
    "Extract design system from provided images.",
    "Return colors using OKLCH values.",
    "Include typography, spacing, radius, shadows, and component patterns."
  ].join("\n");
}

export function pageSpecPrompt(): string {
  return [
    "Extract page specification from provided images.",
    "Describe sections in visual order.",
    "Include layout, content, interactions, and responsive notes."
  ].join("\n");
}
