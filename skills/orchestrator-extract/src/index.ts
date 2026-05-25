export * from "./prompts.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("orchestrator-extract skill ready");
  process.exit(0);
}
