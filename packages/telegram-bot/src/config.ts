import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface BotConfig {
  telegramBotToken: string;
  telegramAdminId: number;
  dataDir: string;
  personaName: string;
  personaPrompt: string;
  piModel?: string | undefined;
  toolVerbosity: "all" | "summary" | "errors-only" | "none";
}

export function loadConfig(): BotConfig {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }

  const telegramBotToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const telegramAdminId = parseInt(requireEnv("TELEGRAM_ADMIN_ID"), 10);
  if (!Number.isInteger(telegramAdminId) || telegramAdminId <= 0) {
    throw new Error("TELEGRAM_ADMIN_ID must be a positive integer");
  }

  const dataDir = process.env["DATA_DIR"] ?? "/data/pi-orchestrator";
  const personaName = process.env["PERSONA_NAME"] ?? "Kira";
  const personaPrompt = process.env["PERSONA_PROMPT"] ?? "You are a helpful frontend specialist. Keep responses concise.";
  const piModel = process.env["PI_MODEL"] ?? undefined;
  const toolVerbosity = parseToolVerbosity(process.env["TOOL_VERBOSITY"]);

  return {
    telegramBotToken,
    telegramAdminId,
    dataDir,
    personaName,
    personaPrompt,
    piModel,
    toolVerbosity,
  };
}

function loadEnvFile(envPath: string): void {
  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const sep = normalized.indexOf("=");
    if (sep === -1) continue;

    const key = normalized.slice(0, sep).trim();
    let value = normalized.slice(sep + 1).trim();

    if (!key || process.env[key] !== undefined) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseToolVerbosity(raw: string | undefined): BotConfig["toolVerbosity"] {
  switch (raw?.trim()) {
    case "all":
    case "summary":
    case "errors-only":
    case "none":
      return raw.trim() as BotConfig["toolVerbosity"];
    default:
      return "summary";
  }
}
