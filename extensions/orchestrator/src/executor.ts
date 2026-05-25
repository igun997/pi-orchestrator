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
    case "astro-init":
      return `Scaffold an Astro project in ${projectDir}:
\`\`\`bash
pnpm create astro@latest ${slug} --template minimal --typescript strict --install --no-git --skip-houston
cd ${projectDir}
pnpm astro add cloudflare --yes
pnpm astro add react --yes
pnpm astro add tailwind --yes
git init && git add -A && git commit -m "chore: scaffold"
\`\`\`
Run these commands. Report when done.`;

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
      return `In ${projectDir}, first load impeccable context:
\`\`\`bash
cd ${projectDir}
node ${targetDir}/skills/impeccable/scripts/load-context.mjs
\`\`\`
Then run:
\`\`\`bash
npx impeccable shape "site layout based on page-spec.json sections"
\`\`\`
This plans the UX/UI before building. Report when done.`;

    case "assemble-page":
      return `In ${projectDir}, create src/pages/index.astro that imports all crafted section components from src/components/ and renders them in order. Use the section order from .orchestrator/specs/page-spec.json.`;

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
      return `In ${projectDir}, run impeccable polish for final quality pass:
\`\`\`bash
cd ${projectDir}
npx impeccable polish src/pages/index.astro
\`\`\`
Fix any issues found. This is the final design refinement before audit. Report when done.`;

    case "audit":
      return `In ${projectDir}, run impeccable audit for a11y + perf + responsive checks:
\`\`\`bash
cd ${projectDir}
npx impeccable audit src/pages/index.astro
\`\`\`
Fix all issues found. This must pass before deploy. Report when done.`;

    // === Deploy ===
    case "cf-build":
      return `In ${projectDir}, run:
\`\`\`bash
cd ${projectDir}
pnpm build
\`\`\`
Verify dist/_worker.js exists. Report when done.`;

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
        return `In ${projectDir}, run:
\`\`\`bash
cd ${projectDir}
npx impeccable craft "${sectionId}"
\`\`\`
This builds the ${sectionId} section component. Use Tailwind CSS for all styling.
For any images needed (hero backgrounds, avatars, illustrations), use picsum.photos with seeded URLs:
- Hero/background: https://picsum.photos/seed/${sectionId}-bg/1920/1080?blur=2
- Card images: https://picsum.photos/seed/${sectionId}-{n}/400/300
- Avatars: https://picsum.photos/seed/${sectionId}-avatar-{n}/80/80
Always use \`object-cover\` and include \`alt\` attributes.
Report when done.`;
      }
      if (task.id === "static-init") {
        return `Create a static HTML project in ${projectDir}:
\`\`\`bash
mkdir -p ${projectDir}/src ${projectDir}/public
cd ${projectDir}
pnpm init -y
pnpm add -D tailwindcss @tailwindcss/cli
npx tailwindcss init
\`\`\`
Create index.html in src/ with Tailwind CDN or build setup. Report when done.`;
      }
      return `Execute task "${task.id}": ${task.name}. Use Tailwind CSS for styling. Report when done.`;
  }
}

function slugFromState(state: RunState): string {
  const name = (state.answers["product-name"] as string) ?? "site";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
}
