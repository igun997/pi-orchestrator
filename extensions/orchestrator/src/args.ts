export interface StartArgs {
  autoHeal: boolean;
  tui: boolean;
  designSystemImage: string;
  pageImage: string;
}

export function parseStartArgs(raw: string): StartArgs {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const autoHeal = parts.includes("--auto-heal");
  const tui = parts.includes("--tui");
  const images = parts.filter((part) => !part.startsWith("--"));

  if (images.length !== 2) {
    throw new Error("expected two image paths: <design-system-image> <page-image>");
  }

  return {
    autoHeal,
    tui,
    designSystemImage: images[0]!,
    pageImage: images[1]!
  };
}
