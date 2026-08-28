import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  outputDir: "test-results/artifacts",
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: "node tests/fixtures/server.mjs",
    url: "http://127.0.0.1:4173/chatgpt-composer.html",
    reuseExistingServer: false,
    timeout: 10_000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  }
});
