export function astroInitCommands(slug: string): string[] {
  return [
    `pnpm create astro@latest ${slug} -- --template minimal --install --git false`,
    "pnpm astro add cloudflare --yes",
    "pnpm astro add react --yes",
    "pnpm astro add tailwind --yes"
  ];
}
