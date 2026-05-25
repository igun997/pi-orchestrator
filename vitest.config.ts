import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "extensions/**/*.test.ts", "skills/**/*.test.ts", "tests/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
    passWithNoTests: true
  }
});
