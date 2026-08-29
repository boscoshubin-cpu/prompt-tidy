import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareTestExtension } from "./global-setup";

const temporaryRoots: string[] = [];

async function makeProductionExtension(): Promise<{ productionDir: string; testDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "prompt-tidy-global-setup-"));
  temporaryRoots.push(root);
  const productionDir = join(root, "production");
  await mkdir(productionDir);
  await writeFile(join(productionDir, "content.js"), "// packaged content", "utf8");
  await writeFile(join(productionDir, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    host_permissions: ["https://chatgpt.com/*"],
    content_scripts: [{ matches: ["https://chatgpt.com/*"], js: ["content.js"] }]
  }), "utf8");
  return { productionDir, testDir: join(root, "test-extension") };
}

async function expectMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

describe("prepareTestExtension", () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it("removes a partial test extension when copy fails", async () => {
    const { productionDir, testDir } = await makeProductionExtension();
    const copyError = new Error("copy failed");

    await expect(prepareTestExtension({
      productionDir,
      testDir,
      copyExtension: async (_source, destination) => {
        await mkdir(destination);
        await writeFile(join(destination, "partial"), "partial", "utf8");
        throw copyError;
      }
    })).rejects.toBe(copyError);

    await expectMissing(testDir);
  });

  it("removes the copied extension when test-manifest writing fails", async () => {
    const { productionDir, testDir } = await makeProductionExtension();
    const writeError = new Error("write failed");

    await expect(prepareTestExtension({
      productionDir,
      testDir,
      writeManifest: vi.fn().mockRejectedValue(writeError)
    })).rejects.toBe(writeError);

    await expectMissing(testDir);
  });
});
