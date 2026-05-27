#!/usr/bin/env node

import { mkdirSync, existsSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const projectCursorDir = join(repoRoot, ".cursor");
const globalCursorDir = join(homedir(), ".cursor");

const mode = process.argv.includes("--global") ? "global" : "project";
const targetBase = mode === "global" ? globalCursorDir : projectCursorDir;
const targetHooksDir = join(targetBase, "hooks");
const targetRulesDir = join(targetBase, "rules");
const targetSkillsDir = join(targetBase, "skills");

const sourceRule = join(projectCursorDir, "rules", "pi-orchestrator-flow.mdc");
const sourceHookScript = join(projectCursorDir, "hooks", "orchestrator-flow-guard.mjs");
const sourceSkills = [
  "pi-orchestrator-cursor",
  "orchestrator-extract-cursor",
  "orchestrator-build-cursor",
  "orchestrator-deploy-cursor",
];

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function copyRule() {
  ensureDir(targetRulesDir);
  const targetRule = join(targetRulesDir, "pi-orchestrator-flow.mdc");
  if (resolve(targetRule) === resolve(sourceRule)) return targetRule;
  writeFileSync(targetRule, readFileSync(sourceRule, "utf8"), "utf8");
  return targetRule;
}

function copyHookScript() {
  ensureDir(targetHooksDir);
  const targetHook = join(targetHooksDir, "orchestrator-flow-guard.mjs");
  if (resolve(targetHook) === resolve(sourceHookScript)) return targetHook;
  writeFileSync(targetHook, readFileSync(sourceHookScript, "utf8"), "utf8");
  return targetHook;
}

function mergeHooksJson() {
  const hooksPath = join(targetBase, "hooks.json");
  const hooks = readJson(hooksPath, { version: 1, hooks: {} });
  if (!hooks.version) hooks.version = 1;
  if (!hooks.hooks || typeof hooks.hooks !== "object") hooks.hooks = {};
  if (!Array.isArray(hooks.hooks.beforeShellExecution)) hooks.hooks.beforeShellExecution = [];

  const command = mode === "global"
    ? "node ~/.cursor/hooks/orchestrator-flow-guard.mjs"
    : "node .cursor/hooks/orchestrator-flow-guard.mjs";
  const matcher =
    "wrangler\\s+deploy|npm\\s+run\\s+deploy|pnpm\\s+deploy|pnpm\\s+run\\s+deploy|cloudflare";

  const alreadyExists = hooks.hooks.beforeShellExecution.some((entry) => {
    return entry && entry.command && String(entry.command).includes("orchestrator-flow-guard.mjs");
  });

  if (!alreadyExists) {
    hooks.hooks.beforeShellExecution.push({
      command,
      matcher,
      failClosed: false,
    });
  }

  writeJson(hooksPath, hooks);
  return hooksPath;
}

function copySkills() {
  ensureDir(targetSkillsDir);
  const copied = [];
  for (const skillName of sourceSkills) {
    const sourceDir = join(projectCursorDir, "skills", skillName);
    const targetDir = join(targetSkillsDir, skillName);
    if (resolve(sourceDir) === resolve(targetDir)) {
      copied.push(targetDir);
      continue;
    }
    ensureDir(targetDir);
    cpSync(sourceDir, targetDir, { recursive: true });
    copied.push(targetDir);
  }
  return copied;
}

function main() {
  if (!existsSync(projectCursorDir)) {
    throw new Error(`Missing source cursor config at ${projectCursorDir}`);
  }

  ensureDir(targetBase);
  const rulePath = copyRule();
  const hookScriptPath = copyHookScript();
  const hooksJsonPath = mergeHooksJson();
  const skillPaths = copySkills();

  const lines = [
    `Installed Cursor compatibility (${mode})`,
    `- rules: ${rulePath}`,
    `- hook script: ${hookScriptPath}`,
    `- hooks config: ${hooksJsonPath}`,
    `- skills:`,
    ...skillPaths.map((path) => `  - ${path}`),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

main();
