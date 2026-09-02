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
    name: "Prompt Tidy",
    version: "0.1.0",
    description: "Locally tidy ChatGPT drafts before you send them.",
    permissions: ["storage"],
    host_permissions: ["https://chatgpt.com/*"],
    content_scripts: [{
      matches: ["https://chatgpt.com/*"],
      js: ["content.js"],
      run_at: "document_idle",
      world: "ISOLATED"
    }],
    action: {
      default_title: "Prompt Tidy",
      default_popup: "popup.html"
    },
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
    [
      "MAIN-world content script",
      {
        content_scripts: [{
          matches: ["https://chatgpt.com/*"],
          js: ["content.js"],
          run_at: "document_idle",
          world: "MAIN"
        }]
      },
      "content_scripts must exactly equal"
    ],
    [
      "document_start content script",
      {
        content_scripts: [{
          matches: ["https://chatgpt.com/*"],
          js: ["content.js"],
          run_at: "document_start",
          world: "ISOLATED"
        }]
      },
      "content_scripts must exactly equal"
    ],
    [
      "extra content-script field",
      {
        content_scripts: [{
          matches: ["https://chatgpt.com/*"],
          js: ["content.js"],
          run_at: "document_idle",
          world: "ISOLATED",
          all_frames: true
        }]
      },
      "content_scripts must exactly equal"
    ],
    [
      "extra action field",
      {
        action: {
          default_title: "Prompt Tidy",
          default_popup: "popup.html",
          default_icon: "icon.png"
        }
      },
      "action must exactly equal"
    ],
    [
      "Chrome URL override",
      { chrome_url_overrides: { newtab: "popup.html" } },
      "unexpected manifest field: chrome_url_overrides"
    ],
    [
      "Manifest V2 downgrade",
      { manifest_version: 2 },
      "manifest_version must equal 3"
    ]
  ] as const)("rejects manifest mutation: %s", async (_label, overrides, message) => {
    const packageRoot = await makePackageManifest(overrides);

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining(message)
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
    "Function/* audit */('return 1')",
    "// function\nFunction('return 1')",
    "obj.function\nFunction('return 1')",
    'const obj = { 𐐀function: 1 }; obj.𐐀function\nFunction("return 1")',
    "obj. /* audit */ function\nFunction('return 1')",
    "class Example { #function = 1; run() { this.#function\nFunction('return 1') } }\nnew Example().run()",
    "new window.Function('return 1')",
    "window.Function('return 1')",
    "new globalThis.Function('return 1')",
    "globalThis.Function('return 1')",
    "globalThis[\"Function\"]('return 1')",
    "window /* audit */ ['Function']('return 1')",
    "setTimeout('globalThis.compromised = true', 0)",
    'setTimeout("globalThis.compromised = true", 0)',
    "setTimeout(`globalThis.compromised = true`, 0)",
    "setInterval('globalThis.compromised = true', 0)",
    "setInterval(`globalThis.compromised = true`, 0)",
    'setTimeout(/* audit */ "globalThis.compromised = true", 0)',
    "setInterval(/* audit */ `globalThis.compromised = true`, 0)",
    "setTimeout/* audit */('globalThis.compromised = true', 0)",
    "setInterval/* audit */(`globalThis.compromised = true`, 0)"
  ])("rejects a packaged dynamic execution variant", async (contents) => {
    const packageRoot = await makePackageManifest({}, { "content.js": contents });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining("execution surface")
    });
  });

  it.each([
    "custom.Function(1)",
    "custom['Function'](1)",
    "function Function() {}",
    "function/* audit */Function() {}"
  ])("allows a non-global Function reference that is not an execution surface", async (contents) => {
    const packageRoot = await makePackageManifest({}, { "content.js": contents });

    await expect(runPackageChecker(packageRoot)).resolves.toBeUndefined();
  });

  it.each([
    [
      "direct Function call",
      "const audit = `result: ${Function('return 1')}`;"
    ],
    [
      "string timer call",
      "const audit = `result: ${setTimeout('globalThis.compromised = true', 0)}`;"
    ],
    [
      "nested template string timer call",
      'const audit = `outer ${setInterval(`globalThis.compromised = true`, 0)}`;'
    ],
    [
      "nested template interpolation",
      'const audit = `outer ${`inner ${Function("return 1")}`}`;'
    ],
    [
      "escaped backtick before bracket Function call",
      'const audit = `escaped \\` quasi ${globalThis["Function"]("return 1")}`;'
    ]
  ])("rejects a packaged %s inside template interpolation", async (_label, contents) => {
    const packageRoot = await makePackageManifest({}, { "content.js": contents });

    await expect(runPackageChecker(packageRoot)).rejects.toMatchObject({
      stderr: expect.stringContaining("execution surface")
    });
  });

  it.each([
    [
      "ordinary quasi text",
      "const note = `Function('return 1') and setTimeout('globalThis.compromised = true', 0)`;"
    ],
    [
      "escaped interpolation text",
      'const note = `escaped \\${Function("return 1")} text`;'
    ],
    [
      "string value inside interpolation",
      'const note = `${"Function(\\"return 1\\")"}`;'
    ]
  ])("allows non-executable Function text in template literal %s", async (_label, contents) => {
    const packageRoot = await makePackageManifest({}, { "content.js": contents });

    await expect(runPackageChecker(packageRoot)).resolves.toBeUndefined();
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
