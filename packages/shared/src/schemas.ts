import { z } from "zod";

export const OklchColorSchema = z.string().regex(/^oklch\(/, "color must be OKLCH");

export const DesignSystemSchema = z.object({
  colors: z.object({
    primary: OklchColorSchema,
    secondary: OklchColorSchema,
    accent: OklchColorSchema,
    neutrals: z.array(OklchColorSchema).min(1),
    semantic: z.object({
      success: OklchColorSchema,
      warn: OklchColorSchema,
      error: OklchColorSchema,
      info: OklchColorSchema
    })
  }),
  typography: z.object({
    fontFamilies: z.object({ display: z.string(), body: z.string(), mono: z.string() }),
    scale: z.array(z.string()).min(1),
    weights: z.array(z.number()).min(1)
  }),
  spacing: z.object({ unit: z.string(), scale: z.array(z.string()).min(1) }),
  radii: z.array(z.string()).default([]),
  shadows: z.array(z.string()).default([]),
  borders: z.array(z.string()).default([]),
  components: z.array(z.object({ name: z.string(), variants: z.array(z.string()).default([]), states: z.array(z.string()).default([]) })).default([])
});

export const PageSpecSchema = z.object({
  meta: z.object({ inferredPageType: z.enum(["landing", "dashboard", "docs", "product", "other"]) }),
  layout: z.object({ grid: z.string(), breakpoints: z.array(z.string()).default([]), container: z.string().default("max-w-7xl") }),
  sections: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.string(),
    order: z.number().int().nonnegative(),
    content: z.record(z.unknown()).default({}),
    components: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([])
  })).min(1)
});

export const TaskStatusSchema = z.enum(["pending", "running", "complete", "failed", "skipped"]);
export const PhaseSchema = z.enum(["idle", "interviewing", "extracting", "generating", "questioning", "confirming", "scaffolding", "building", "deploying", "done", "failed"]);

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: TaskStatusSchema,
  deps: z.array(z.string()).default([]),
  hash: z.string().optional(),
  logs: z.string().optional(),
  errorRef: z.string().optional()
});

export const RunStateSchema = z.object({
  runId: z.string(),
  createdAt: z.string(),
  phase: PhaseSchema,
  inputs: z.object({ designSystemImage: z.string().optional(), pageImage: z.string().optional() }),
  specs: z.object({ designSystem: z.string().optional(), page: z.string().optional() }).default({}),
  answers: z.record(z.unknown()).default({}),
  confirmed: z.boolean().default(false),
  tasks: z.array(TaskSchema),
  stack: z.record(z.unknown()).default({}),
  config: z.object({ autoHeal: z.boolean().default(false), maxParallelImpeccable: z.number().int().positive().default(3) }).default({}),
  options: z.object({ dashboard: z.boolean().default(false) }).default({}),
  deployment: z.object({ url: z.string().optional() }).default({})
});

export type DesignSystem = z.infer<typeof DesignSystemSchema>;
export type PageSpec = z.infer<typeof PageSpecSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Phase = z.infer<typeof PhaseSchema>;

/**
 * Three output modes:
 * - "static"       : pure HTML + Tailwind CDN, zero npm, no build step
 * - "astro-static" : Astro SSG, pnpm build → dist/index.html
 * - "astro-server" : Astro SSR with Cloudflare adapter, pnpm build → dist/_worker.js
 */
export type OutputMode = "static" | "astro-static" | "astro-server";

/**
 * Derive output mode from user answers.
 * - framework="static" → static (no npm, CDN only)
 * - framework="astro" + backend none/contact-form → astro-static (SSG)
 * - framework="astro" + backend auth/cms → astro-server (SSR, needs server routes)
 */
export function resolveOutputMode(framework: string, backend: string): OutputMode {
  if (framework === "static" || framework?.includes("static")) return "static";
  if (backend === "auth" || backend === "cms") return "astro-server";
  return "astro-static";
}
