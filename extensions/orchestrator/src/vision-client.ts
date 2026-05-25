import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

export interface VisionClientConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
}

export interface VisionResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number } | undefined;
}

function mimeFromExt(path: string): string {
  const ext = extname(path).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  };
  return map[ext] ?? "image/png";
}

async function imageToDataUri(path: string): Promise<string> {
  const buf = await readFile(path);
  const mime = mimeFromExt(path);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Call 9router vision endpoint with one or more images + a text prompt.
 * Uses streaming to collect full response.
 */
export async function callVision(
  config: VisionClientConfig,
  imagePaths: string[],
  prompt: string,
  options?: { responseFormat?: object }
): Promise<VisionResult> {
  const imageContent = await Promise.all(
    imagePaths.map(async (p) => ({
      type: "image_url" as const,
      image_url: { url: await imageToDataUri(p) }
    }))
  );

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...imageContent
      ]
    }
  ];

  const body: Record<string, unknown> = {
    model: config.model ?? "kr/auto",
    messages,
    stream: false
  };

  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`9router vision error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const content = json.choices?.[0]?.message?.content ?? "";
  return {
    content,
    usage: json.usage
      ? { promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens }
      : undefined
  };
}

/**
 * Load 9router config from environment.
 * Reads NINEROUTER_URL and NINEROUTER_KEY (same env vars pi uses).
 */
export function loadVisionConfig(): VisionClientConfig {
  const baseUrl = process.env.NINEROUTER_URL ?? "http://localhost:20128";
  const apiKey = process.env.NINEROUTER_KEY ?? process.env.NINEROUTER_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("NINEROUTER_KEY not set. Ensure 9router is configured in pi.");
  }
  return { baseUrl, apiKey, model: "kr/auto" };
}
