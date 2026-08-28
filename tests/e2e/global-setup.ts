import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { FullConfig } from "@playwright/test";

import { fixtureMatch, productionExtensionDir, testExtensionDir } from "./harness-paths";

interface ExtensionManifest {
  background?: unknown;
  host_permissions: string[];
  content_scripts: Array<{ matches: string[] }>;
}

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  const manifestPath = join(productionExtensionDir, "manifest.json");
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

  await rm(testExtensionDir, { force: true, recursive: true });
  await cp(productionExtensionDir, testExtensionDir, { recursive: true });

  const testManifest: ExtensionManifest = structuredClone(productionManifest);
  testManifest.host_permissions.push(fixtureMatch);
  testManifest.content_scripts[0]?.matches.push(fixtureMatch);
  await writeFile(
    join(testExtensionDir, "manifest.json"),
    `${JSON.stringify(testManifest, null, 2)}\n`,
    "utf8"
  );

  return async () => {
    await rm(testExtensionDir, { force: true, recursive: true });
  };
}
