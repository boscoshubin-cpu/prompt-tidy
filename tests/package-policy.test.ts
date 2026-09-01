import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const temporaryDirectories: string[] = [];

async function makePackageManifest(
  overrides: Record<string, unknown>,
  assetOverrides: Record<string, string> = {}
): Promise<string> {
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

  const assets = {
    "content.js": "",
    "popup.html": "",
    "popup.js": "",
    ...assetOverrides
  };
  await Promise.all([
    readFile(join(repositoryRoot, "scripts", "check-package.mjs"), "utf8").then((source) => (
      writeFile(join(scriptsDirectory, "check-package.mjs"), source, "utf8")
    )),
    writeFile(join(distributionDirectory, "manifest.json"), JSON.stringify(manifest), "utf8"),
    ...Object.entries(assets).map(async ([path, contents]) => {
      const destination = join(distributionDirectory, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, contents, "utf8");
    })
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

  it.each([
    ["HTML image", "popup.html", '<img src="https://tracker.example/pixel.png">'],
    ["WebSocket URL", "content.js", 'new WebSocket("wss://socket.example/events")'],
    ["protocol-relative CSS URL", "styles/theme.css", "body{background:url(//cdn.example/pixel.png)}"],
    ["assembled endpoint", "content.js", 'const endpoint = "https:" + "//api.example/collect";'],
    ["hex-escaped endpoint", "content.js", 'const endpoint = "https:\\x2f\\x2fapi.example/collect";'],
    ["percent-encoded endpoint", "config/runtime.json", '{"endpoint":"https%3A%2F%2Fapi.example%2Fcollect"}'],
    ["base64-prefixed endpoint", "config/runtime.json", '{"endpoint":"aHR0cHM6Ly9hcGkuZXhhbXBsZS9jb2xsZWN0"}']
  ])("rejects a packaged %s in %s", async (_label, path, contents) => {
    const packageRoot = await makePackageManifest({}, { [path]: contents });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining("remote reference")
    });
  });

  it.each([
    ["network API", "fetch('/collect')", "network surface"],
    ["dynamic execution", "eval('globalThis.compromised = true')", "execution surface"]
  ])("rejects an unexpected %s even without a literal endpoint", async (_label, contents, message) => {
    const packageRoot = await makePackageManifest({}, { "content.js": contents });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining(message)
    });
  });

  it.each([
    "new Function('return 1')",
    "Function('return 1')",
    "new window.Function('return 1')",
    "window.Function('return 1')",
    "new globalThis.Function('return 1')",
    "globalThis.Function('return 1')",
    "setTimeout('globalThis.compromised = true', 0)",
    "setTimeout(`globalThis.compromised = true`, 0)",
    "setInterval('globalThis.compromised = true', 0)",
    "setInterval(`globalThis.compromised = true`, 0)"
  ])("rejects a packaged dynamic execution variant", async (contents) => {
    const packageRoot = await makePackageManifest({}, { "content.js": contents });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining("execution surface")
    });
  });

  it("rejects an externally connectable manifest surface", async () => {
    const packageRoot = await makePackageManifest({
      externally_connectable: { matches: ["https://example.com/*"] }
    });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining("externally_connectable")
    });
  });

  it("allows only the exact W3C namespace identifiers required by the bundle", async () => {
    const packageRoot = await makePackageManifest({}, {
      "content.js": [
        'const math = "http://www.w3.org/1998/Math/MathML";',
        'const html = "http://www.w3.org/1999/xhtml";',
        'const svg = "http://www.w3.org/2000/svg";'
      ].join("\n")
    });

    await expect(runPackageChecker(packageRoot)).resolves.toBeUndefined();
  });

  it("rejects a URL that merely begins with an allowed W3C namespace", async () => {
    const packageRoot = await makePackageManifest({}, {
      "content.js": 'const endpoint = "http://www.w3.org/2000/svg.evil.example/collect";'
    });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining("remote reference")
    });
  });
});
