#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const projectCursorDir = join(repoRoot, ".cursor");
const globalCursorDir = join(homedir(), ".cursor");

const mode = process.argv.includes("--global") ? "global" : "project";
const dryRun = process.argv.includes("--dry-run");
const targetBase = mode === "global" ? globalCursorDir : projectCursorDir;

const rulePath = join(targetBase, "rules", "pi-orchestrator-flow.mdc");
const hookScriptPath = join(targetBase, "hooks", "orchestrator-flow-guard.mjs");
const hooksPath = join(targetBase, "hooks.json");
const skillNames = [
  "pi-orchestrator-cursor",
  "orchestrator-extract-cursor",
  "orchestrator-build-cursor",
  "orchestrator-deploy-cursor",
];

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

function removePath(path, changes) {
  if (!existsSync(path)) return;
  changes.push(`remove ${path}`);
  if (!dryRun) {
    rmSync(path, { recursive: true, force: true });
  }
}

function cleanHooks(changes) {
  if (!existsSync(hooksPath)) return;
  const hooks = readJson(hooksPath, { version: 1, hooks: {} });
  const before = Array.isArray(hooks?.hooks?.beforeShellExecution)
    ? hooks.hooks.beforeShellExecution
    : [];
  const after = before.filter((entry) => {
    return !(entry && entry.command && String(entry.command).includes("orchestrator-flow-guard.mjs"));
  });

  if (after.length !== before.length) {
    changes.push(`update ${hooksPath} (remove orchestrator-flow-guard hook)`);
    if (!dryRun) {
      hooks.hooks.beforeShellExecution = after;
      writeJson(hooksPath, hooks);
    }
  }
}

function main() {
  const changes = [];
  removePath(rulePath, changes);
  removePath(hookScriptPath, changes);
  cleanHooks(changes);

  for (const skillName of skillNames) {
    removePath(join(targetBase, "skills", skillName), changes);
  }

  const header = dryRun
    ? `Dry run: Cursor compatibility uninstall (${mode})`
    : `Uninstalled Cursor compatibility (${mode})`;

  const lines = [header];
  if (changes.length === 0) {
    lines.push("- no orchestrator-managed Cursor files found");
  } else {
    for (const change of changes) lines.push(`- ${change}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

main();
