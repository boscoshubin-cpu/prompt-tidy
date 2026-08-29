import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { FullConfig } from "@playwright/test";

import { fixtureMatch, productionExtensionDir, testExtensionDir } from "./harness-paths";

interface ExtensionManifest {
  background?: unknown;
  host_permissions: string[];
  content_scripts: Array<{ matches: string[] }>;
}

export interface PrepareTestExtensionOptions {
  productionDir?: string;
  testDir?: string;
  copyExtension?(source: string, destination: string): Promise<void>;
  writeManifest?(path: string, contents: string): Promise<void>;
}

export async function prepareTestExtension({
  productionDir = productionExtensionDir,
  testDir = testExtensionDir,
  copyExtension = (source, destination) => cp(source, destination, { recursive: true }),
  writeManifest = (path, contents) => writeFile(path, contents, "utf8")
}: PrepareTestExtensionOptions = {}): Promise<void> {
  const manifestPath = join(productionDir, "manifest.json");
  const productionManifest = JSON.parse(await readFile(manifestPath, "utf8")) as ExtensionManifest;

  if (
    productionManifest.host_permissions.length !== 1
    || productionManifest.host_permissions[0] !== "https://chatgpt.com/*"
    || productionManifest.content_scripts.length !== 1
    || productionManifest.content_scripts[0]?.matches.length !== 1
    || productionManifest.content_scripts[0]?.matches[0] !== "https://chatgpt.com/*"
    || productionManifest.background !== undefined
  ) {
    throw new Error(
      "The production manifest must remain scoped only to https://chatgpt.com/* and have no background worker."
    );
  }

  await rm(testDir, { force: true, recursive: true });

  try {
    await copyExtension(productionDir, testDir);
    const testManifest: ExtensionManifest = structuredClone(productionManifest);
    testManifest.host_permissions.push(fixtureMatch);
    testManifest.content_scripts[0]?.matches.push(fixtureMatch);
    await writeManifest(
      join(testDir, "manifest.json"),
      `${JSON.stringify(testManifest, null, 2)}\n`
    );
  } catch (error) {
    try {
      await rm(testDir, { force: true, recursive: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Test extension preparation failed and its partial output could not be removed."
      );
    }
    throw error;
  }
}

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  await prepareTestExtension();

  return async () => {
    await rm(testExtensionDir, { force: true, recursive: true });
  };
}
