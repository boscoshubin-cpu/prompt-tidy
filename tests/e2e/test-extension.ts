import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { chromium, expect, test as base, type BrowserContext } from "@playwright/test";

import { projectRoot, testExtensionDir } from "./harness-paths";
import { withPersistentContext } from "./persistent-context";

interface WorkerFixtures {
  extensionContext: BrowserContext;
}

function findChromeForTesting(): string | undefined {
  const configuredPath = process.env.PROMPT_TIDY_CHROME_EXECUTABLE;
  if (configuredPath) {
    const executablePath = isAbsolute(configuredPath)
      ? configuredPath
      : resolve(projectRoot, configuredPath);
    if (!existsSync(executablePath)) {
      throw new Error(`PROMPT_TIDY_CHROME_EXECUTABLE does not exist: ${executablePath}`);
    }
    return executablePath;
  }

  const chromeCache = resolve(projectRoot, ".cache/chrome-for-testing/chrome");
  if (!existsSync(chromeCache)) return undefined;

  for (const version of readdirSync(chromeCache).sort().reverse()) {
    const executablePath = resolve(
      chromeCache,
      version,
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    );
    if (existsSync(executablePath)) return executablePath;
  }

  return undefined;
}

export const test = base.extend<object, WorkerFixtures>({
  extensionContext: [async ({}, use) => {
    await withPersistentContext<BrowserContext>({
      createUserDataDir: () => mkdtemp(join(tmpdir(), "prompt-tidy-playwright-")),
      discoverExecutable: findChromeForTesting,
      launch: (userDataDir, executablePath) => chromium.launchPersistentContext(userDataDir, {
        ...(executablePath
          ? { executablePath }
          : { channel: process.env.PROMPT_TIDY_BROWSER_CHANNEL ?? "chromium" }),
        headless: true,
        args: [
          `--disable-extensions-except=${testExtensionDir}`,
          `--load-extension=${testExtensionDir}`
        ]
      }),
      removeUserDataDir: (userDataDir) => rm(userDataDir, { force: true, recursive: true })
    }, use);
  }, { scope: "worker" }],
  context: async ({ extensionContext }, use) => {
    await use(extensionContext);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    try {
      await use(page);
    } finally {
      await page.close();
    }
  }
});

export { expect };
