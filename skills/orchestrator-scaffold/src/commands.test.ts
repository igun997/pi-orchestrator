import { describe, expect, it } from "vitest";
import { astroInitCommands } from "./commands.js";

describe("astroInitCommands", () => {
  it("returns Astro setup commands for Cloudflare, React, and Tailwind", () => {
    const commands = astroInitCommands("acme-site");

    expect(commands).toContain("pnpm create astro@latest acme-site -- --template minimal --install --git false");
    expect(commands).toContain("pnpm astro add cloudflare --yes");
    expect(commands).toContain("pnpm astro add react --yes");
    expect(commands).toContain("pnpm astro add tailwind --yes");
  });
});
