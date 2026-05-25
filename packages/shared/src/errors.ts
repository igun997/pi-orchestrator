export type ErrorClass = "transient" | "recoverable" | "fatal";

export function classifyError(error: unknown): ErrorClass {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (/\b(429|rate limit|timeout|timed out|econnreset|5\d\d|mcp not connected)\b/i.test(msg)) return "transient";
  if (lower.includes("invalid image") || lower.includes("unsupported media") || lower.includes("quota") || lower.includes("missing mcp")) return "fatal";
  if (lower.includes("tsc") || lower.includes("eslint") || lower.includes("broken import") || lower.includes("build failed")) return "recoverable";
  return "fatal";
}
