import { access, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const distributionDirectory = join(repositoryRoot, "extension", "dist");
const manifestPath = join(distributionDirectory, "manifest.json");
const forbiddenPermissions = new Set([
  "tabs",
  "cookies",
  "clipboardRead",
  "clipboardWrite",
  "history",
  "webRequest"
]);
const allowedNamespaceUrls = new Set([
  "http://www.w3.org/1998/Math/MathML",
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/2000/svg"
]);

function fail(message) {
  throw new Error(`Prompt Tidy package policy: FAIL — ${message}`);
}

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJavaScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }

  return files;
}

async function verifyPackage() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const hostPermissions = manifest.host_permissions;
  if (
    !Array.isArray(hostPermissions)
    || hostPermissions.length !== 1
    || hostPermissions[0] !== "https://chatgpt.com/*"
  ) {
    fail("host_permissions must equal ['https://chatgpt.com/*']");
  }

  if (manifest.background !== undefined) {
    fail("background and service-worker entries are forbidden");
  }

  const contentScripts = manifest.content_scripts;
  if (
    !Array.isArray(contentScripts)
    || contentScripts.length !== 1
    || !Array.isArray(contentScripts[0]?.matches)
    || contentScripts[0].matches.length !== 1
    || contentScripts[0].matches[0] !== "https://chatgpt.com/*"
  ) {
    fail("content-script matches must remain scoped to https://chatgpt.com/*");
  }

  const declaredPermissions = [
    ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
    ...(Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : [])
  ];
  const forbidden = declaredPermissions.filter((permission) => forbiddenPermissions.has(permission));
  if (forbidden.length > 0) {
    fail(`forbidden permission(s): ${forbidden.join(", ")}`);
  }

  for (const requiredAsset of ["content.js", "popup.html", "popup.js"]) {
    try {
      await access(join(distributionDirectory, requiredAsset));
    } catch {
      fail(`missing built asset: ${requiredAsset}`);
    }
  }

  const javaScriptFiles = await listJavaScriptFiles(distributionDirectory);
  if (!javaScriptFiles.some((path) => path.endsWith("popup.js"))) {
    fail("popup bundle was not found");
  }

  for (const path of javaScriptFiles) {
    const source = await readFile(path, "utf8");
    const urls = source.match(/https?:\/\/[^\s"'`\\)]+/gu) ?? [];
    const applicationEndpoint = urls.find((url) => !allowedNamespaceUrls.has(url));
    if (applicationEndpoint) {
      fail(`application endpoint found in ${relative(repositoryRoot, path)}: ${applicationEndpoint}`);
    }
  }
}

try {
  await verifyPackage();
  console.log("Prompt Tidy package policy: PASS");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
