import type { BotConfig } from "./config.js";

export interface Persona {
  name: string;
  systemPrompt: string;
}

/**
 * Build persona system prompt from config.
 * Injected as prefix to all pi sessions.
 */
export function buildPersona(config: BotConfig): Persona {
  return {
    name: config.personaName,
    systemPrompt: [
      config.personaPrompt,
      "",
      "Rules:",
      "- Auto-detect user's language and respond in the same language.",
      "- Keep responses concise for Telegram (short paragraphs, use formatting).",
      "- Use HTML formatting: <b>bold</b>, <i>italic</i>, <code>code</code>, <pre>blocks</pre>.",
      "- When user wants to build a site, activate orchestrator-interview skill.",
    ].join("\n"),
  };
}
