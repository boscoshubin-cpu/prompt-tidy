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
const requiredManifestFields = new Set([
  "action",
  "content_scripts",
  "description",
  "host_permissions",
  "manifest_version",
  "name",
  "permissions",
  "version"
]);
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
  /\bWebAssembly\s*\.(?:compile|instantiate)\s*\(/u,
  /\bjavascript\s*:/iu,
  /\bdata\s*:\s*text\/javascript/iu
];
const functionConstructionPattern = /(?<![\p{L}\p{N}_$.])(?:new\s+)?(?:(?:window|globalThis)\s*\.\s*)?Function\s*\(/gu;
const bracketFunctionConstructionPattern = /(?<![\p{L}\p{N}_$])(?:new(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))+)?(?:window|globalThis)(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*\[(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*(["'`])Function\1(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*\](?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*\(/gu;
const timerStringExecutionPattern = /\bset(?:Timeout|Interval)(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*\((?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*(?:(["'])[^]*?\1|`[^]*?`)/gu;

function fail(message) {
  throw new Error(`Prompt Tidy package policy: FAIL — ${message}`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields(value, expectedFields) {
  if (!isRecord(value)) return false;
  const actualFields = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  return actualFields.length === expected.length
    && actualFields.every((field, index) => field === expected[index]);
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
  const regexPrefixKeywords = new Set([
    "await",
    "case",
    "delete",
    "do",
    "else",
    "in",
    "instanceof",
    "new",
    "of",
    "return",
    "throw",
    "typeof",
    "void",
    "yield"
  ]);
  const contexts = [{ kind: "code", canStartRegex: true }];
  const maskedCharacter = (character) => (
    character === "\n" || character === "\r" ? character : " "
  );

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    const context = contexts.at(-1);

    if (context?.kind === "regex") {
      if (character === "\\") {
        view += maskedCharacter(character);
        index += 1;
        if (index < source.length) {
          view += maskedCharacter(source[index]);
          index += 1;
        }
        continue;
      }
      if (character === "[") context.inCharacterClass = true;
      if (character === "]") context.inCharacterClass = false;
      view += maskedCharacter(character);
      index += 1;
      if (character === "/" && !context.inCharacterClass) {
        contexts.pop();
        while (/[a-z]/iu.test(source[index] ?? "")) {
          view += " ";
          index += 1;
        }
      }
      continue;
    }

    if (context?.kind === "string") {
      if (character === "\\") {
        view += maskedCharacter(character);
        index += 1;
        if (index < source.length) {
          view += maskedCharacter(source[index]);
          index += 1;
        }
        continue;
      }
      view += maskedCharacter(character);
      if (character === context.delimiter) contexts.pop();
      index += 1;
      continue;
    }

    if (context?.kind === "template") {
      if (character === "\\") {
        view += maskedCharacter(character);
        index += 1;
        if (index < source.length) {
          view += maskedCharacter(source[index]);
          index += 1;
        }
        continue;
      }
      if (character === "`") {
        view += " ";
        contexts.pop();
        index += 1;
        continue;
      }
      if (character === "$" && next === "{") {
        view += "  ";
        contexts.push({ kind: "interpolation", braceDepth: 0, canStartRegex: true });
        index += 2;
        continue;
      }
      view += maskedCharacter(character);
      index += 1;
      continue;
    }

    if (character === "'" || character === '"') {
      if (context) context.canStartRegex = false;
      contexts.push({ kind: "string", delimiter: character });
      view += " ";
      index += 1;
      continue;
    }

    if (character === "`") {
      if (context) context.canStartRegex = false;
      contexts.push({ kind: "template" });
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

    if (character === "/" && context?.canStartRegex) {
      context.canStartRegex = false;
      contexts.push({ kind: "regex", inCharacterClass: false });
      view += " ";
      index += 1;
      continue;
    }

    const identifier = /^[$\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*/u.exec(source.slice(index))?.[0];
    if (identifier) {
      view += identifier;
      context.canStartRegex = regexPrefixKeywords.has(identifier);
      index += identifier.length;
      continue;
    }

    if (context?.kind === "interpolation") {
      if (character === "{") {
        context.braceDepth += 1;
      } else if (character === "}") {
        if (context.braceDepth === 0) {
          view += " ";
          contexts.pop();
          index += 1;
          continue;
        }
        context.braceDepth -= 1;
      }
    }

    if ((character === "+" || character === "-") && next === character) {
      view += `${character}${next}`;
      index += 2;
      continue;
    }

    if (character === "?" && next === ".") {
      context.canStartRegex = false;
      view += "?.";
      index += 2;
      continue;
    }

    if (/\s/u.test(character ?? "")) {
      view += character;
      index += 1;
      continue;
    }

    if (/[([{:;,=!?&|+\-*%^~<>]/u.test(character ?? "")) {
      context.canStartRegex = true;
    } else if (character === "/") {
      context.canStartRegex = true;
    } else {
      context.canStartRegex = false;
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

  for (const match of declarationView.matchAll(functionConstructionPattern)) {
    const value = match[0];
    const matchIndex = match.index ?? 0;
    const functionOffset = matchIndex + value.lastIndexOf("Function");
    if (!hasFunctionDeclarationPrefix(declarationView, functionOffset)) return true;
  }

  return false;
}

function startsInExecutableCode(declarationView, match) {
  const offset = match.index ?? 0;
  return /[$\p{ID_Start}]/u.test(declarationView[offset] ?? "");
}

function hasBracketFunctionConstructionSurface(source) {
  const declarationView = declarationSourceView(source);
  return [...source.matchAll(bracketFunctionConstructionPattern)]
    .some((match) => startsInExecutableCode(declarationView, match));
}

function hasTimerStringExecutionSurface(source) {
  const declarationView = declarationSourceView(source);
  return [...source.matchAll(timerStringExecutionPattern)]
    .some((match) => startsInExecutableCode(declarationView, match));
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

  if (
    hasFunctionConstructionSurface(source)
    || hasBracketFunctionConstructionSurface(source)
    || hasTimerStringExecutionSurface(source)
    || executionSurfacePatterns.some((pattern) => pattern.test(source))
  ) {
    fail(`unexpected execution surface found in ${displayPath}`);
  }
}

async function verifyPackage() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!isRecord(manifest)) fail("manifest must be a JSON object");
  if (manifest.manifest_version !== 3) fail("manifest_version must equal 3");

  for (const surface of forbiddenManifestSurfaces) {
    if (manifest[surface] !== undefined) {
      fail(`${surface} manifest surface is forbidden`);
    }
  }

  if (manifest.optional_permissions !== undefined) {
    fail("optional_permissions are forbidden");
  }

  if (manifest.optional_host_permissions !== undefined) {
    fail("optional_host_permissions are forbidden");
  }

  const unexpectedManifestField = Object.keys(manifest)
    .find((field) => !requiredManifestFields.has(field));
  if (unexpectedManifestField) {
    fail(`unexpected manifest field: ${unexpectedManifestField}`);
  }
  const missingManifestField = [...requiredManifestFields]
    .find((field) => manifest[field] === undefined);
  if (missingManifestField) {
    fail(`missing manifest field: ${missingManifestField}`);
  }
  if (manifest.name !== "Prompt Tidy") fail("name must equal 'Prompt Tidy'");
  if (manifest.description !== "Locally tidy ChatGPT drafts before you send them.") {
    fail("description must match the reviewed production description");
  }
  if (typeof manifest.version !== "string" || !/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/u.test(manifest.version)) {
    fail("version must be a dotted numeric Chrome extension version");
  }

  const hostPermissions = manifest.host_permissions;
  if (
    !Array.isArray(hostPermissions)
    || hostPermissions.length !== 1
    || hostPermissions[0] !== requiredProductionHost
  ) {
    fail("host_permissions must equal ['https://chatgpt.com/*']");
  }

  const contentScripts = manifest.content_scripts;
  const contentScript = contentScripts?.[0];
  if (
    !Array.isArray(contentScripts)
    || contentScripts.length !== 1
    || !hasExactFields(contentScript, ["js", "matches", "run_at", "world"])
    || !Array.isArray(contentScript.matches)
    || contentScript.matches.length !== 1
    || contentScript.matches[0] !== requiredProductionHost
    || !Array.isArray(contentScript.js)
    || contentScript.js.length !== 1
    || contentScript.js[0] !== "content.js"
    || contentScript.run_at !== "document_idle"
    || contentScript.world !== "ISOLATED"
  ) {
    fail("content_scripts must exactly equal the reviewed isolated document_idle content script");
  }

  const action = manifest.action;
  if (
    !hasExactFields(action, ["default_popup", "default_title"])
    || action.default_popup !== "popup.html"
    || action.default_title !== "Prompt Tidy"
  ) {
    fail("action must exactly equal the reviewed popup action");
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
