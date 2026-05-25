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
      return `Read .orchestrator/specs/design-system.json and .orchestrator/specs/page-spec.json from ${targetDir}/.orchestrator/specs/. Also read .orchestrator/state.json answers.
Write PRODUCT.md and DESIGN.md to ${projectDir}/ root matching impeccable's expected format:
- PRODUCT.md: Product Name, register field, Users, Product Purpose, Tone, Anti-references
- DESIGN.md: Colors (OKLCH), Typography, Spacing, Radii, Shadows, Components, Page sections
Use the answers and specs to fill content. This is the handoff to impeccable.`;

    // === Build ===
    case "impeccable-shape":
      return `In ${projectDir}, run:
\`\`\`bash
cd ${projectDir}
npx impeccable shape "site layout"
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
      return `In ${projectDir}, run:
\`\`\`bash
cd ${projectDir}
npx impeccable polish src/pages/index.astro
\`\`\`
Report when done.`;

    case "audit":
      return `In ${projectDir}, run:
\`\`\`bash
cd ${projectDir}
npx impeccable audit src/pages/index.astro
\`\`\`
If audit finds issues, fix them. Report when done.`;

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
This builds the ${sectionId} section component. Use Tailwind CSS for all styling. Report when done.`;
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
