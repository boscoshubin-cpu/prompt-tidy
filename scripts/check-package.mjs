import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
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
const requiredProductionHost = "https://chatgpt.com/*";
const scannedAssetExtensions = new Set([".css", ".cjs", ".html", ".js", ".json", ".mjs"]);
const forbiddenManifestSurfaces = [
  "background",
  "content_security_policy",
  "devtools_page",
  "externally_connectable",
  "oauth2",
  "options_page",
  "options_ui",
  "sandbox",
  "side_panel",
  "web_accessible_resources"
];
const networkSurfacePatterns = [
  /\bfetch\s*\(/u,
  /\bXMLHttpRequest\b/u,
  /\bWebSocket\s*\(/u,
  /\bEventSource\s*\(/u,
  /\.sendBeacon\s*\(/u,
  /\bimportScripts\s*\(/u,
  /\bnew\s+(?:Shared)?Worker\s*\(/u
];
const executionSurfacePatterns = [
  /\beval\s*\(/u,
  /\bset(?:Timeout|Interval)\s*\(\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))\s*)*(?:(["'])[^]*?\1|`[^]*?`)/u,
  /\bWebAssembly\s*\.(?:compile|instantiate)\s*\(/u,
  /\bjavascript\s*:/iu,
  /\bdata\s*:\s*text\/javascript/iu
];
const functionConstructionPattern = /(?<![\p{L}\p{N}_$.])(?:new\s+)?(?:(?:window|globalThis)\s*\.\s*)?Function\s*\(/gu;

function fail(message) {
  throw new Error(`Prompt Tidy package policy: FAIL — ${message}`);
}

async function listPackageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listPackageFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function decodeStaticCharacterEscapes(source) {
  return source
    .replace(/\\x([0-9a-f]{2})/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/%([0-9a-f]{2})/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function collapseStaticStringConcatenations(source) {
  let collapsed = source;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = collapsed.replace(/(["'`])\s*\+\s*(["'`])/gu, "");
    if (next === collapsed) break;
    collapsed = next;
  }
  return collapsed;
}

function sourceViews(source) {
  const decoded = decodeStaticCharacterEscapes(source);
  return new Set([
    source,
    decoded,
    collapseStaticStringConcatenations(source),
    collapseStaticStringConcatenations(decoded)
  ]);
}

function declarationSourceView(source) {
  let view = "";
  let index = 0;
  let quote;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (quote) {
      if (character === "\\") {
        view += "  ";
        index += 2;
        continue;
      }
      view += character === "\n" || character === "\r" ? character : " ";
      if (character === quote) quote = undefined;
      index += 1;
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      view += " ";
      index += 1;
      continue;
    }

    if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") {
        view += " ";
        index += 1;
      }
      continue;
    }

    if (character === "/" && next === "*") {
      while (index < source.length) {
        const commentCharacter = source[index];
        const commentNext = source[index + 1];
        view += commentCharacter === "\n" || commentCharacter === "\r" ? commentCharacter : " ";
        index += 1;
        if (commentCharacter === "*" && commentNext === "/") {
          view += " ";
          index += 1;
          break;
        }
      }
      continue;
    }

    view += character;
    index += 1;
  }

  return view;
}

function hasFunctionDeclarationPrefix(source, functionOffset) {
  const prefix = source.slice(0, functionOffset);
  const keywordMatch = /function\s*$/u.exec(prefix);
  if (!keywordMatch) return false;

  const characterBeforeKeyword = [...source.slice(0, keywordMatch.index)].at(-1);
  if (characterBeforeKeyword && /[$\p{ID_Continue}\u200C\u200D]/u.test(characterBeforeKeyword)) {
    return false;
  }

  const precedingCode = source.slice(0, keywordMatch.index).trimEnd();
  if (precedingCode.endsWith("#")) return false;
  if (precedingCode.endsWith(".") && !precedingCode.endsWith("...")) return false;

  return true;
}

function hasFunctionConstructionSurface(source) {
  const declarationView = declarationSourceView(source);

  for (const match of source.matchAll(functionConstructionPattern)) {
    const value = match[0];
    const matchIndex = match.index ?? 0;
    const functionOffset = matchIndex + value.lastIndexOf("Function");
    if (!hasFunctionDeclarationPrefix(declarationView, functionOffset)) return true;
  }

  return false;
}

function remoteReferences(source) {
  const references = new Set();
  const absolutePattern = /(?:https?|wss?):\/\/[^\s"'`\\)<>{}\[\],;]+/giu;
  const protocolRelativePattern = /(?<![:\\/])\/\/(?:localhost(?::\d+)?|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|(?:[a-z0-9-]+\.)+[a-z]{2,})(?:[^\s"'`\\)<>{}\[\],;]*)/giu;

  for (const view of sourceViews(source)) {
    for (const match of view.matchAll(absolutePattern)) references.add(match[0]);
    for (const match of view.matchAll(protocolRelativePattern)) references.add(match[0]);
  }

  return references;
}

function isAllowedRemoteReference(path, reference) {
  if (allowedNamespaceUrls.has(reference)) return true;
  return path === manifestPath && reference === requiredProductionHost;
}

function verifyAssetSource(path, source) {
  const displayPath = relative(repositoryRoot, path);
  const encodedScheme = source.match(/(?:aHR0cDovL|aHR0cHM6Ly|d3M6Ly|d3NzOi8)/u)?.[0];
  if (encodedScheme) {
    fail(`encoded remote reference found in ${displayPath}`);
  }

  const unexpectedReference = [...remoteReferences(source)]
    .find((reference) => !isAllowedRemoteReference(path, reference));
  if (unexpectedReference) {
    fail(`remote reference found in ${displayPath}: ${unexpectedReference}`);
  }

  if (networkSurfacePatterns.some((pattern) => pattern.test(source))) {
    fail(`unexpected network surface found in ${displayPath}`);
  }

  if (hasFunctionConstructionSurface(source) || executionSurfacePatterns.some((pattern) => pattern.test(source))) {
    fail(`unexpected execution surface found in ${displayPath}`);
  }
}

async function verifyPackage() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const hostPermissions = manifest.host_permissions;
  if (
    !Array.isArray(hostPermissions)
    || hostPermissions.length !== 1
    || hostPermissions[0] !== requiredProductionHost
  ) {
    fail("host_permissions must equal ['https://chatgpt.com/*']");
  }

  for (const surface of forbiddenManifestSurfaces) {
    if (manifest[surface] !== undefined) {
      fail(`${surface} manifest surface is forbidden`);
    }
  }

  const contentScripts = manifest.content_scripts;
  if (
    !Array.isArray(contentScripts)
    || contentScripts.length !== 1
    || !Array.isArray(contentScripts[0]?.matches)
    || contentScripts[0].matches.length !== 1
    || contentScripts[0].matches[0] !== requiredProductionHost
  ) {
    fail("content-script matches must remain scoped to https://chatgpt.com/*");
  }

  const declaredPermissions = [
    ...(Array.isArray(manifest.permissions) ? manifest.permissions : [])
  ];
  if (declaredPermissions.length !== 1 || declaredPermissions[0] !== "storage") {
    fail("permissions must equal ['storage']");
  }
  const forbidden = declaredPermissions.filter((permission) => forbiddenPermissions.has(permission));
  if (forbidden.length > 0) {
    fail(`forbidden permission(s): ${forbidden.join(", ")}`);
  }

  if (manifest.optional_permissions !== undefined) {
    fail("optional_permissions are forbidden");
  }

  if (manifest.optional_host_permissions !== undefined) {
    fail("optional_host_permissions are forbidden");
  }

  for (const requiredAsset of ["content.js", "popup.html", "popup.js"]) {
    try {
      await access(join(distributionDirectory, requiredAsset));
    } catch {
      fail(`missing built asset: ${requiredAsset}`);
    }
  }

  const packageFiles = await listPackageFiles(distributionDirectory);
  if (!packageFiles.some((path) => path.endsWith("popup.js"))) {
    fail("popup bundle was not found");
  }

  for (const path of packageFiles.filter((assetPath) => scannedAssetExtensions.has(extname(assetPath)))) {
    const source = await readFile(path, "utf8");
    verifyAssetSource(path, source);
  }
}

try {
  await verifyPackage();
  console.log("Prompt Tidy package policy: PASS");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
