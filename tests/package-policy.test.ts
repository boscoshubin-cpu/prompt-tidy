import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const temporaryDirectories: string[] = [];

async function makePackageManifest(overrides: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "prompt-tidy-package-policy-"));
  temporaryDirectories.push(root);
  const distributionDirectory = join(root, "extension", "dist");
  const scriptsDirectory = join(root, "scripts");
  await Promise.all([
    mkdir(distributionDirectory, { recursive: true }),
    mkdir(scriptsDirectory, { recursive: true })
  ]);
  const manifest = {
    manifest_version: 3,
    permissions: ["storage"],
    host_permissions: ["https://chatgpt.com/*"],
    content_scripts: [{ matches: ["https://chatgpt.com/*"], js: ["content.js"] }],
    action: { default_popup: "popup.html" },
    ...overrides
  };

  await Promise.all([
    readFile(join(repositoryRoot, "scripts", "check-package.mjs"), "utf8").then((source) => (
      writeFile(join(scriptsDirectory, "check-package.mjs"), source, "utf8")
    )),
    writeFile(join(distributionDirectory, "manifest.json"), JSON.stringify(manifest), "utf8"),
    writeFile(join(distributionDirectory, "content.js"), "", "utf8"),
    writeFile(join(distributionDirectory, "popup.html"), "", "utf8"),
    writeFile(join(distributionDirectory, "popup.js"), "", "utf8")
  ]);
  return root;
}

async function runPackageChecker(packageRoot: string): Promise<void> {
  await execFileAsync(process.execPath, ["scripts/check-package.mjs"], {
    cwd: packageRoot
  });
}

describe("package policy", () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => (
      rm(path, { force: true, recursive: true })
    )));
  });

  it("rejects optional host access even when required hosts remain scoped", async () => {
    const packageRoot = await makePackageManifest({
      optional_host_permissions: ["<all_urls>"]
    });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining("optional_host_permissions are forbidden")
    });
  });

  it("rejects optional permissions outside the minimum production boundary", async () => {
    const packageRoot = await makePackageManifest({
      optional_permissions: ["activeTab"]
    });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining("optional_permissions are forbidden")
    });
  });
});
