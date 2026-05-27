import type { Task, RunState } from "@orchestrator/shared";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Generates a prompt for the LLM to execute a given task.
 * The LLM has access to mcp(), Bash, impeccable, and file tools.
 */
export function taskToPrompt(task: Task, state: RunState, targetDir: string): string {
  const slug = slugFromState(state);
  const projectDir = join(targetDir, slug);
  const backend = (state.answers["backend-level"] as string) ?? "none";

  switch (task.id) {
    // === Scaffold ===
    case "astro-init": {
      const skipCloudflare = !state.answers["domain"] || state.answers["domain"] === "none";
      const cfLines = skipCloudflare ? "" : `
pnpm astro add cloudflare --yes`;
      return `Scaffold an Astro project in ${projectDir}:
\`\`\`bash
pnpm create astro@latest ${slug} --template minimal --typescript strict --install --no-git --skip-houston
cd ${projectDir}
pnpm approve-builds esbuild sharp 2>/dev/null || true
pnpm install
pnpm astro add react --yes
pnpm astro add tailwind --yes${cfLines}
pnpm approve-builds workerd msw 2>/dev/null || true
pnpm install
\`\`\`

Then configure astro.config.mjs for STATIC generation:
\`\`\`javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] }
});
\`\`\`

Also set up tsconfig.json paths:
\`\`\`json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
\`\`\`

Create directory structure:
\`\`\`bash
mkdir -p src/components/ui src/components/sections src/layouts src/pages src/styles
\`\`\`

Create src/styles/global.css (Tailwind v4 CSS entry point):
\`\`\`css
@import "tailwindcss";
\`\`\`

Create src/layouts/BaseLayout.astro:
\`\`\`astro
---
import '../styles/global.css';

interface Props { title: string; description?: string; }
const { title, description } = Astro.props;
---
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  {description && <meta name="description" content={description} />}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body class="antialiased font-[Poppins]">
  <slot />
</body>
</html>
\`\`\`

Then: git init && git add -A && git commit -m "chore: scaffold"
Report when done.`;
    }

    case "supabase-provision":
      return `Use supabase MCP to create project "${slug}". Then apply schema for level "${backend}":
- "contact-form": create table public.messages (id uuid primary key default gen_random_uuid(), name text, email text, message text, created_at timestamptz default now()) with RLS insert-only policy.
- "auth": same + enable supabase auth + create profiles table with trigger.
- "cms": same + pages, media tables + storage bucket.
After schema applied, generate TypeScript types and save to ${projectDir}/src/types/db.ts.
Set SUPABASE_URL and SUPABASE_ANON_KEY in ${projectDir}/.env.`;

    case "shadcn-init":
      return `In ${projectDir}, initialize shadcn:
\`\`\`bash
cd ${projectDir}
pnpm dlx shadcn@latest init --yes
\`\`\`
Then use shadcn MCP to add components detected in .orchestrator/specs/design-system.json (map: Button→button, Card→card, TextInput→input, etc). Report when done.`;

    case "write-context":
      return `Read the extracted specs from ${targetDir}/.orchestrator/specs/design-system.json and ${targetDir}/.orchestrator/specs/page-spec.json.

Generate two files in ${projectDir}/ root for impeccable:

**PRODUCT.md** (required by impeccable):
\`\`\`markdown
# ${slug}

## Register
${state.answers["register"] ?? "product"}

## Users
${state.answers["target-users"] ?? "General users visiting the landing page"}

## Product Purpose
Landing page / marketing site based on provided design reference.

## Tone
Follow the reference images exactly. ${state.answers["tone"] ?? ""}

## Anti-references
Generic SaaS templates, stock illustrations, cookie-cutter layouts.

## Strategic Principles
- Follow the design system reference exactly
- Match the page structure from the spec
- Use Tailwind CSS for all styling
\`\`\`

**DESIGN.md** (strongly recommended by impeccable):
Convert design-system.json into DESIGN.md format:
- Colors: list all colors in OKLCH format (convert hex to oklch)
- Typography: font families, scale, weights
- Spacing: unit + scale
- Radii, Shadows, Borders
- Components: list with variants
- Layout: from page-spec.json layout field

Use OKLCH for all colors (impeccable requirement). Write both files. Report when done.`;

    // === Build ===
    case "impeccable-shape":
      return `You are now acting as the impeccable design skill.
Read the PRODUCT.md and DESIGN.md in ${projectDir}/.
Read the page-spec from ${targetDir}/.orchestrator/specs/page-spec.json.

Plan the UX/UI layout for the full site. For each section in the page spec:
- Decide the layout approach (grid, flex, etc)
- Choose which design tokens to apply
- Plan component hierarchy
- Note responsive breakpoints
- Plan BEHAVIORS: scroll effects, hover states, transitions, animations
- Plan EFFECTS: gradients, overlays, clip-paths, backdrop-blur, decorative elements
- Plan INTERACTIONS: navbar scroll behavior (transparent→solid), parallax, stagger reveals

Write the shape plan to ${projectDir}/SHAPE.md with section-by-section breakdown.
Use Tailwind CSS classes in your plan. Follow DESIGN.md colors/typography exactly.
Include specific Tailwind classes for:
- Scroll-triggered transitions (intersection observer + opacity/translate)
- Navbar: sticky top-0, bg-transparent → bg-white/80 backdrop-blur on scroll
- Gradient overlays: bg-gradient-to-b, from-black/50
- Clip paths: clip-path polygon/circle for image masking
- Hover states: hover:scale, hover:shadow-xl, group-hover
Report when done.`;

    case "assemble-page": {
      const isAstro = (state.answers["framework"] as string) === "astro";
      if (isAstro) {
        return `Read the page-spec from ${targetDir}/.orchestrator/specs/page-spec.json for section order.
Create ${projectDir}/src/pages/index.astro that imports all section components from src/components/sections/ and renders them in order.

Example:
\`\`\`astro
---
import Navbar from "../components/sections/navbar.astro";
import Hero from "../components/sections/hero.astro";
// ... import all sections
---
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Site Title</title>
</head>
<body class="antialiased">
  <Navbar />
  <main>
    <Hero />
    <!-- ... all sections in order -->
  </main>
  <Footer />
</body>
</html>
\`\`\`

Use the section order from page-spec.json. Report when done.`;
      }
      return `Call the merge_sections tool to combine all section HTML files into src/index.html.
It will read sections from ${projectDir}/src/sections/ in page-spec order and inject into the base template.
After merging, verify the result looks correct by reading the output file.
Report when done.`;
    }

    case "wire-supabase":
      return `In ${projectDir}, create src/lib/supabase.ts:
\`\`\`typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/db.js";
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
\`\`\`
Wire it into any form/auth components that need it.`;

    case "polish":
      return `You are now acting as the impeccable polish skill.
Read PRODUCT.md, DESIGN.md, SHAPE.md, and all HTML/component files in ${projectDir}/src/.

Perform a final quality pass focusing on BEHAVIORAL FIDELITY:
- Navbar: must transition from transparent to solid on scroll (JS + Tailwind)
- Hero: verify gradient overlays, shades, decorative elements match reference
- Images: check clip-path/mask implementations, object-fit, aspect ratios
- Hover states: every interactive element needs visible hover feedback
- Transitions: smooth (duration-300, ease-out), no jarring jumps
- Scroll animations: fade-in-up on viewport entry (intersection observer)
- Shadows: verify elevation hierarchy matches design system
- Gradients: check direction, stops, opacity match reference
- Decorative: floating shapes, blur blobs, dot patterns if in spec
- Spacing rhythm: verify section padding consistency
- Color consistency: all colors from DESIGN.md tokens, no hardcoded values
- Typography scale: verify heading hierarchy matches spec

Edit files directly. Use Tailwind CSS. Add JS for scroll behaviors if needed.
Report changes made.`;

    case "audit": {
      const isAstro = (state.answers["framework"] as string) === "astro";
      const astroChecks = isAstro ? `
**Astro-specific:**
- output: 'static' in astro.config.mjs (SSG, no server)
- No unnecessary client:load directives (only for interactive React components)
- Reusable UI components in src/components/ui/ (not duplicated inline)
- Section components import from ui/ (DRY)
- BaseLayout.astro used in pages
- Props typed with interface
- No inline <script> that could be an Astro component
- Images use Astro <Image /> or proper loading="lazy"
- Build test: run \`pnpm build\` and verify dist/ output is static HTML
` : "";
      return `You are now acting as the impeccable audit skill.
Read all ${isAstro ? ".astro" : "HTML"} files in ${projectDir}/src/.
Read DESIGN.md and SHAPE.md for reference.

Perform technical quality checks:

**Accessibility:**
- Alt text on all images (descriptive, not "image")
- Aria labels on interactive elements
- Focus states visible (ring-2 or outline)
- Color contrast WCAG AA (check against DESIGN.md tokens)
- Semantic HTML (nav, main, section, article, footer)
- Skip-to-content link

**Behavioral completeness:**
- Navbar scroll behavior implemented (not just static)
- All hover states working (buttons, cards, links)
- Scroll reveal animations present where spec requires
- Image clip-paths/masks rendering correctly
- Gradient overlays visible and correct direction
- Responsive: all breakpoints tested (mobile 640px, tablet 1024px)

**Performance:**
- Images: lazy loading (loading="lazy"), proper dimensions
- No layout shift (explicit width/height or aspect-ratio)
- Minimal JS (intersection observer only, no heavy libs)
${astroChecks}
**Design fidelity:**
- Compare each section against page-spec.json behaviors/effects
- Flag any missing interactions or effects from the spec
- Verify decorative elements present (shapes, patterns, blobs)

Fix all issues found directly in the files. Report what was fixed.`;
    }

    // === Deploy ===
    case "cf-build": {
      const isAstro = (state.answers["framework"] as string) === "astro";
      if (isAstro) {
        return `In ${projectDir}, run:
\`\`\`bash
cd ${projectDir}
pnpm build
\`\`\`
Verify dist/ output contains static HTML files. Report when done.`;
      }
      // Static HTML: use @tailwindcss/cli to compile production CSS, then copy to dist/
      return `In ${projectDir}, build production static site:
\`\`\`bash
cd ${projectDir}
pnpm exec tailwindcss -i src/styles/input.css -o dist/output.css --minify
mkdir -p dist
cp src/index.html dist/index.html
cp -r public/* dist/ 2>/dev/null || true
\`\`\`
Then edit dist/index.html:
- Remove the \`<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>\` tag
- Replace with \`<link rel="stylesheet" href="/output.css" />\`

This produces optimized, purged CSS for production. No CDN script in production.
Report when done.`;
    }

    case "cf-worker-create":
      return `Use cloudflare MCP to create a Worker named "${slug}". If it already exists, skip. Report when done.`;

    case "cf-secrets-push":
      return `Use cloudflare MCP to push secrets to worker "${slug}":
- Read SUPABASE_URL and SUPABASE_ANON_KEY from ${projectDir}/.env
- Push each as a secret via MCP.
Report when done.`;

    case "cf-deploy":
      return `Use cloudflare MCP to deploy worker "${slug}" from ${projectDir}/dist/. Report the deployment URL when done.`;

    case "cf-domain-attach": {
      const domain = state.answers["domain"] as string;
      return `Use cloudflare MCP to attach custom domain "${domain}" to worker "${slug}". Set up DNS route. Report when done.`;
    }

    default:
      // craft-{section} tasks
      if (task.id.startsWith("craft-")) {
        const sectionId = task.id.replace("craft-", "");
        const isAstro = (state.answers["framework"] as string) === "astro";
        const fileExt = isAstro ? "astro" : "html";
        const outputDir = isAstro ? "src/components/sections" : "src/sections";
        const outputPath = `${projectDir}/${outputDir}/${sectionId}.${fileExt}`;

        const astroNote = isAstro ? `
This is an Astro component (.astro file). Follow these patterns:

1. REUSABLE UI components go in src/components/ui/ (Button.astro, Card.astro, Badge.astro)
2. SECTION components go in src/components/sections/ and import from ui/
3. Only use client:load on React components that need interactivity (shadcn)
4. Prefer Astro components (zero JS) over React unless state/interactivity needed
5. Use Astro props for data passing

Pattern:
\`\`\`astro
---
// src/components/sections/${sectionId}.astro
import Button from "@/components/ui/Button.astro";
import Card from "@/components/ui/Card.astro";

interface Props { class?: string; }
const { class: className } = Astro.props;
---
<section class:list={["py-16 lg:py-20", className]}>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- section content using reusable components -->
    <Card>
      <h3>Title</h3>
    </Card>
    <Button variant="primary" href="#">CTA</Button>
  </div>
</section>
\`\`\`

If you need a reusable UI component that doesn't exist yet, CREATE it in src/components/ui/ first.
Common UI components to create: Button.astro, Card.astro, Badge.astro, SectionHeading.astro
` : "";

        return `You are now acting as the impeccable craft skill.
Read PRODUCT.md, DESIGN.md, and SHAPE.md in ${projectDir}/.
Read the page-spec section "${sectionId}" from ${targetDir}/.orchestrator/specs/page-spec.json.

Build the "${sectionId}" section as a complete ${isAstro ? "Astro" : "HTML"} component in ${outputPath}.
${astroNote}
Requirements:
- Use Tailwind CSS for ALL styling (reference DESIGN.md tokens)
- Follow the layout plan from SHAPE.md for this section
- Match colors, typography, spacing from DESIGN.md exactly
- For images, use picsum.photos with seeded URLs:
  - Backgrounds: https://picsum.photos/seed/${sectionId}-bg/1920/1080?blur=2
  - Cards: https://picsum.photos/seed/${sectionId}-{n}/400/300
  - Avatars: https://picsum.photos/seed/${sectionId}-avatar-{n}/80/80
- Always use object-cover and include alt attributes
- Make it responsive (mobile-first)
- Use semantic HTML

BEHAVIORAL requirements (from page-spec behaviors/effects):
- Implement ALL scroll behaviors noted in spec (fade-in, slide-up, parallax)
- Implement ALL hover states (scale, shadow, color shift)
- Implement gradient overlays/shades if noted
- Implement clip-paths/masks for images if noted
- Implement decorative elements (floating shapes, blur blobs, patterns)
- Add intersection observer JS for scroll-triggered animations
- Navbar sections: implement transparent→solid scroll transition

For scroll animations, add this pattern:
\`\`\`html
<div class="opacity-0 translate-y-8 transition-all duration-700" data-reveal>
  <!-- content -->
</div>
<script>
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.remove('opacity-0', 'translate-y-8'); } });
}, { threshold: 0.1 });
document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
</script>
\`\`\`

For clip-path images:
\`\`\`html
<div class="[clip-path:polygon(0_0,100%_0,100%_85%,0_100%)]">
  <img src="..." class="w-full h-full object-cover" />
</div>
\`\`\`

Write the complete section ${fileExt}. Report when done.`;
      }
      if (task.id === "static-init") {
        return `Create a static HTML project in ${projectDir}:
\`\`\`bash
mkdir -p ${projectDir}/src/sections ${projectDir}/src/styles ${projectDir}/public
cd ${projectDir}
pnpm init -y
pnpm add -D tailwindcss @tailwindcss/cli
\`\`\`

Create src/styles/input.css (Tailwind v4 CSS entry point for CLI build):
\`\`\`css
@import "tailwindcss";
\`\`\`

Create src/index.html with Tailwind CDN for development:
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="antialiased">
  <!-- sections -->
</body>
</html>
\`\`\`

Add build script to package.json:
\`\`\`json
{ "scripts": { "build": "tailwindcss -i src/styles/input.css -o dist/output.css --minify" } }
\`\`\`

IMPORTANT: Do NOT install Vite, PostCSS, webpack, or any bundler.
Do NOT create vite.config, postcss.config, or tailwind.config files.
Tailwind v4 needs only @tailwindcss/cli for static HTML builds.
The CDN script is for development preview only — production uses the CLI build.

Report when done.`;
      }
      return `Execute task "${task.id}": ${task.name}. Use Tailwind CSS for styling. Report when done.`;
  }
}

export function slugFromState(state: RunState): string {
  const name = (state.answers["product-name"] as string) ?? "site";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
}
