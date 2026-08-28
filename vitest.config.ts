import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    restoreMocks: true,
    clearMocks: true,
    include: ["packages/**/*.test.ts", "extension/**/*.test.ts", "tests/**/*.test.ts"]
  }
});
