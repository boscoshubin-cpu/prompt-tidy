import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: "jsdom",
    restoreMocks: true,
    clearMocks: true,
    include: ["packages/**/*.test.ts", "extension/**/*.test.{ts,tsx}", "tests/**/*.test.ts"]
  }
});
