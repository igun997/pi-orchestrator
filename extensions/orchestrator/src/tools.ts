import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Type } from "typebox";
import { hexBatchToOklch, hexToOklch } from "./color.js";
import { mergeSections } from "./merge.js";

export interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: any,
    signal: AbortSignal,
    onUpdate: (...args: any[]) => void,
    ctx: any
  ) => Promise<{ content: Array<Record<string, unknown>>; details: Record<string, unknown> }>;
}

export function createSubagentTools(orchestratorDir: string): ToolDef[] {
  return [
    {
      name: "read_image",
      label: "Read Image",
      description: "Read and analyze a local image file. Returns visual content or description depending on model capabilities.",
      parameters: Type.Object({
        path: Type.String({ description: "Absolute or relative path to the image file" }),
        prompt: Type.Optional(Type.String({ description: "What to extract or focus on (default: describe everything)" }))
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const resolved = params.path.startsWith("/") ? params.path : join(ctx.cwd, params.path);
        if (!existsSync(resolved)) {
          return { content: [{ type: "text" as const, text: `Error: File not found: ${resolved}` }], details: {} };
        }

        const ext = extname(resolved).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"
        };
        const mime = mimeMap[ext];
        if (!mime) {
          return { content: [{ type: "text" as const, text: `Error: Unsupported image format: ${ext}` }], details: {} };
        }

        const buf = await readFile(resolved);
        const base64 = buf.toString("base64");

        const provider: string = (ctx as any).model?.provider ?? "";
        const modelId: string = (ctx as any).model?.id ?? "kr/auto";
        const supportsNativeImage = (ctx as any).model?.input?.includes("image") ?? false;

        const nativeProviders = ["google", "google-vertex", "anthropic", "amazon-bedrock"];
        if (nativeProviders.includes(provider) && supportsNativeImage) {
          return {
            content: [
              { type: "image" as const, data: base64, mimeType: mime },
              { type: "text" as const, text: `Image: ${resolved} (${mime}, ${Math.round(buf.length / 1024)}KB)` }
            ],
            details: {}
          };
        }

        const baseUrl = process.env.NINEROUTER_URL ?? "http://localhost:20128";
        const apiKey = process.env.NINEROUTER_KEY ?? process.env.NINEROUTER_API_KEY ?? "";

        if (!apiKey) {
          return {
            content: [
              { type: "image" as const, data: base64, mimeType: mime },
              { type: "text" as const, text: `Image: ${resolved} (${mime}, ${Math.round(buf.length / 1024)}KB)` }
            ],
            details: {}
          };
        }

        const dataUri = `data:${mime};base64,${base64}`;
        const userPrompt = params.prompt ?? "Describe this image in exhaustive detail. Include all visible text, colors, layout, components, and structure.";

        try {
          const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: modelId,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: userPrompt },
                  { type: "image_url", image_url: { url: dataUri } }
                ]
              }],
              stream: false
            })
          });

          if (!res.ok) {
            const errText = await res.text();
            return { content: [{ type: "text" as const, text: `Vision API error ${res.status}: ${errText}` }], details: {} };
          }

          const json = await res.json() as { choices: { message: { content: string } }[] };
          const description = json.choices?.[0]?.message?.content ?? "No response";

          return {
            content: [{ type: "text" as const, text: `[Image: ${resolved} (${mime}, ${Math.round(buf.length / 1024)}KB)]\n\n${description}` }],
            details: {}
          };
        } catch (e: any) {
          return { content: [{ type: "text" as const, text: `Vision error: ${e.message}` }], details: {} };
        }
      }
    },
    {
      name: "merge_sections",
      label: "Merge Sections",
      description: "Merge all HTML section files from src/sections/ into src/index.html in page-spec order. Call after all craft tasks complete.",
      parameters: Type.Object({
        projectDir: Type.Optional(Type.String({ description: "Project directory (default: cwd/site)" }))
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const projectDir = params.projectDir ?? join(ctx.cwd, "site");
        const specsDir = join(orchestratorDir, ".orchestrator/specs");

        try {
          const result = await mergeSections(projectDir, specsDir);
          return {
            content: [{ type: "text" as const, text: `✓ Merged ${result.sections.length} sections into ${result.merged}\nOrder: ${result.sections.join(" → ")}` }],
            details: {}
          };
        } catch (e: any) {
          return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], details: {} };
        }
      }
    },
    {
      name: "hex_to_oklch",
      label: "Hex to OKLCH",
      description: "Convert hex color(s) to OKLCH format. Accepts single hex or JSON object of name:hex pairs.",
      parameters: Type.Object({
        colors: Type.Union([
          Type.String({ description: "Single hex color like #FF7A59" }),
          Type.Record(Type.String(), Type.String(), { description: "Object of name:hex pairs like {primary: '#FF7A59', secondary: '#1E63D6'}" })
        ])
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        if (typeof params.colors === "string") {
          const oklch = hexToOklch(params.colors);
          return { content: [{ type: "text" as const, text: `${params.colors} → ${oklch}` }], details: {} };
        }
        const results = hexBatchToOklch(params.colors as Record<string, string>);
        const lines = Object.entries(results).map(([name, { hex, oklch }]) => `| ${name} | ${hex} | ${oklch} |`);
        const table = `| Token | Hex | OKLCH |\n|---|---|---|\n${lines.join("\n")}`;
        return { content: [{ type: "text" as const, text: table }], details: {} };
      }
    }
  ];
}
