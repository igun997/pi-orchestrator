#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.resume();
  });
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function printAllow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
}

function printAsk(userMessage, agentMessage) {
  process.stdout.write(
    JSON.stringify({
      permission: "ask",
      user_message: userMessage,
      agent_message: agentMessage,
    }),
  );
}

async function main() {
  const payload = safeParseJson(await readStdin());
  const cwd = payload.cwd || process.cwd();
  const command = String(payload.command || "").toLowerCase();

  if (!command) {
    printAllow();
    return;
  }

  const maybeDeploy =
    command.includes("wrangler deploy") ||
    command.includes("cloudflare") ||
    command.includes("npm run deploy") ||
    command.includes("pnpm deploy") ||
    command.includes("pnpm run deploy");

  if (!maybeDeploy) {
    printAllow();
    return;
  }

  const statePath = join(cwd, ".orchestrator", "state.json");
  if (!existsSync(statePath)) {
    printAsk(
      "No .orchestrator/state.json found in this project. Continue deploy anyway?",
      "Flow guard: deploy command detected before orchestrator state exists.",
    );
    return;
  }

  const state = safeParseJson(readFileSync(statePath, "utf8"));
  if (!state.confirmed) {
    printAsk(
      "Run is not confirmed yet. Continue deploy anyway?",
      "Flow guard: deploy command detected before confirm phase.",
    );
    return;
  }

  printAllow();
}

main().catch(() => {
  printAllow();
});
