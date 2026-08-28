# Prompt Tidy MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable open-source Chrome extension that locally tidies a ChatGPT draft in Compact or Structured mode, previews the result, and replaces the draft only after explicit confirmation.

**Architecture:** A Manifest V3 content script mounts an isolated Preact interface next to ChatGPT's composer through a dedicated adapter. A browser-independent TypeScript transformer performs deterministic protected-span handling, rewriting, metrics, and fidelity validation; Chrome-specific code only reads/writes the composer and stores non-sensitive preferences.

**Tech Stack:** Node.js 22+, npm workspaces, TypeScript, Chrome Manifest V3, Vite, Preact, Vitest, Testing Library, jsdom, Playwright

**Spec:** `docs/superpowers/specs/2026-08-28-prompt-tidy-design.md`

## Global Constraints

- The only supported host is `https://chatgpt.com/*`.
- The extension must never send a ChatGPT message automatically.
- Drafts, transformed output, prompt history, and analytics must never be persisted.
- User text must never be sent over the network.
- Only the last selected mode may be stored with `chrome.storage.local`.
- The transformer must not invent requirements, roles, facts, or constraints.
- Numbers, dates, prices, URLs, email addresses, paths, quotes, code, negations, and explicit constraints must be protected and validated.
- Compact and Structured transformations must be deterministic for a fixed transformer version.
- Token counts are estimates and must never be described as billing data or guaranteed savings.
- Content must be rendered as text, never injected as trusted HTML.
- Host, tabs, cookies, clipboard, history, telemetry, and remote-code permissions outside the documented minimum are forbidden.
- Use Node.js 22 or newer; commit the generated `package-lock.json`.
- Every task follows red-green-refactor and ends with the exact test command plus a focused Git commit.

## File Map

```text
prompt-tidy/
├── package.json                         # workspace scripts and dev dependencies
├── package-lock.json                    # reproducible dependency graph
├── tsconfig.base.json                   # strict shared TypeScript settings
├── vitest.config.ts                     # deterministic unit-test environment
├── extension/
│   ├── manifest.json                    # MV3 permissions, content script, action
│   ├── package.json                     # extension package and build scripts
│   ├── vite.config.ts                   # content script build entry
│   ├── vite.popup.config.ts             # isolated popup HTML build
│   ├── popup.html                       # compatibility-status entry page
│   └── src/
│       ├── content/index.tsx            # content-script composition root
│       ├── chatgpt/adapter.ts           # ChatGPT composer read/write boundary
│       ├── chatgpt/observer.ts          # debounced, idempotent composer discovery
│       ├── ui/app.tsx                   # Tidy button and preview state flow
│       ├── ui/preview-panel.tsx         # accessible preview and confirmation UI
│       ├── ui/styles.ts                 # Shadow DOM scoped CSS string
│       ├── settings/mode-store.ts       # last-mode local preference only
│       ├── popup/index.ts               # non-sensitive compatibility status
│       └── popup/index.test.ts          # status rendering tests
├── packages/transformer/
│   ├── package.json                     # reusable transformer package
│   ├── src/index.ts                     # public transform API
│   ├── src/types.ts                     # stable public types
│   ├── src/protect.ts                   # protected-span extraction/restoration
│   ├── src/normalize.ts                 # safe whitespace normalization
│   ├── src/compact.ts                   # conservative filler and duplicate removal
│   ├── src/structured.ts                # explicit statement classification/rendering
│   ├── src/metrics.ts                   # character and estimated-token metrics
│   └── src/fidelity.ts                  # critical-content comparison and warnings
├── tests/
│   ├── fixtures/chatgpt-composer.html   # controlled host-page DOM
│   ├── e2e/extension.spec.ts            # packaged extension user flow
│   └── privacy/no-network.spec.ts        # network-invariant browser test
├── playwright.config.ts                 # persistent Chromium extension test setup
├── README.md                             # install, claims, limitations, development
├── LICENSE                               # MIT license
├── SECURITY.md                           # private vulnerability reporting guidance
└── docs/
    ├── privacy.md                        # plain-language local-only data behavior
    └── contributing.md                   # test and adapter contribution workflow
```

---

### Task 1: Workspace, Build, and Public Transformer Contract

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `packages/transformer/package.json`
- Create: `packages/transformer/src/types.ts`
- Create: `packages/transformer/src/index.ts`
- Create: `packages/transformer/src/index.test.ts`
- Create: `extension/package.json`
- Create: `extension/manifest.json`
- Create: `extension/vite.config.ts`
- Create: `extension/src/content/index.tsx`

**Interfaces:**
- Consumes: None.
- Produces: `transform(input: string, options: TransformOptions): TransformResult`, plus the exact types below; root scripts `test`, `typecheck`, and `build`.

- [ ] **Step 1: Add the workspace manifests and install the toolchain**

Create the root `package.json` with npm workspaces and scripts:

```json
{
  "name": "prompt-tidy",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["extension", "packages/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.base.json --noEmit",
    "build": "npm run build -w @prompt-tidy/extension",
    "test:e2e": "playwright test"
  },
  "engines": { "node": ">=22" }
}
```

Create `packages/transformer/package.json`:

```json
{
  "name": "@prompt-tidy/transformer",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "exports": "./src/index.ts",
  "scripts": { "test": "vitest run src" }
}
```

Create `extension/package.json`:

```json
{
  "name": "@prompt-tidy/extension",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@prompt-tidy/transformer": "0.1.0",
    "preact": "^10.0.0"
  },
  "scripts": { "build": "vite build --config vite.config.ts" }
}
```

Run after all three package manifests exist:

```bash
npm install preact
npm install -D typescript vite vitest jsdom fast-check @types/chrome @types/node @preact/preset-vite @testing-library/preact @testing-library/user-event @playwright/test
```

Expected: `package-lock.json` includes both workspaces and `npm ls --depth=0` exits 0.

- [ ] **Step 2: Write the failing public-contract test**

Create `packages/transformer/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { transform } from "./index";

describe("transform", () => {
  it("returns deterministic unchanged output for a safe baseline", () => {
    const first = transform("Summarize this report.", { mode: "compact", locale: "en" });
    const second = transform("Summarize this report.", { mode: "compact", locale: "en" });
    expect(first).toEqual(second);
    expect(first.output).toBe("Summarize this report.");
    expect(first.warnings).toEqual([]);
    expect(first.metrics.charactersBefore).toBe(22);
  });
});
```

- [ ] **Step 3: Run the contract test and verify red**

Run: `npx vitest run packages/transformer/src/index.test.ts`

Expected: FAIL because `./index` does not exist.

- [ ] **Step 4: Add strict TypeScript config, exact public types, and minimal transform**

Create `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, DOM and ES2022 libraries, workspace source includes, `jsx: react-jsx`, and `jsxImportSource: preact`.

Create `vitest.config.ts` with `environment: "jsdom"`, `restoreMocks: true`, `clearMocks: true`, and test includes under `packages`, `extension`, and `tests`. The transformer stays browser-independent even though the shared test runtime supplies DOM globals.

Create `packages/transformer/src/types.ts`:

```ts
export type TransformMode = "compact" | "structured";
export type Locale = "auto" | "zh" | "en";
export type ChangeKind = "normalized" | "removed_filler" | "deduplicated" | "structured";
export type WarningCode =
  | "nothing_to_tidy"
  | "only_protected_content"
  | "critical_content_missing"
  | "result_longer";

export interface ChangeSummary {
  kind: ChangeKind;
  description: string;
}

export interface TransformWarning {
  code: WarningCode;
  severity: "info" | "warning" | "error";
  message: string;
  category?: string;
}

export interface TransformOptions {
  mode: TransformMode;
  locale?: Locale;
}

export interface TransformMetrics {
  charactersBefore: number;
  charactersAfter: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
}

export interface TransformResult {
  output: string;
  changes: ChangeSummary[];
  warnings: TransformWarning[];
  metrics: TransformMetrics;
  safeToReplace: boolean;
}
```

Create `packages/transformer/src/index.ts` with a minimal deterministic result and zero-network dependencies. Export all public types from this entry point.

- [ ] **Step 5: Add the buildable MV3 shell**

Create `extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Prompt Tidy",
  "version": "0.1.0",
  "description": "Locally tidy ChatGPT drafts before you send them.",
  "permissions": ["storage"],
  "host_permissions": ["https://chatgpt.com/*"],
  "content_scripts": [{
    "matches": ["https://chatgpt.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle",
    "world": "ISOLATED"
  }],
  "action": { "default_title": "Prompt Tidy" }
}
```

Configure `extension/vite.config.ts` to emit `dist/content.js` as an IIFE with no code splitting and copy `manifest.json` into `dist`:

```ts
import { copyFile, mkdir } from "node:fs/promises";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    lib: {
      entry: "src/content/index.tsx",
      formats: ["iife"],
      name: "PromptTidyContent",
      fileName: () => "content.js"
    },
    rollupOptions: { output: { inlineDynamicImports: true } }
  },
  plugins: [{
    name: "copy-manifest",
    async closeBundle() {
      await mkdir("dist", { recursive: true });
      await copyFile("manifest.json", "dist/manifest.json");
    }
  }]
});
```

The initial `extension/src/content/index.tsx` contains only `export {};` so the shell build proves configuration without adding behavior.

- [ ] **Step 6: Verify contract, typecheck, and build green**

Run:

```bash
npm test
npm run typecheck
npm run build
node -e "const m=require('./extension/dist/manifest.json'); if(m.manifest_version!==3) process.exit(1)"
```

Expected: all commands exit 0 and `extension/dist/content.js` exists.

- [ ] **Step 7: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts packages/transformer extension
git commit -m "build: scaffold Prompt Tidy extension"
```

---

### Task 2: Protected-Span Extraction and Restoration

**Files:**
- Create: `packages/transformer/src/protect.ts`
- Create: `packages/transformer/src/protect.test.ts`

**Interfaces:**
- Consumes: Plain input strings.
- Produces: `protectSpans(input: string): ProtectedDocument`, `restoreSpans(text: string, spans: readonly ProtectedSpan[]): string`, and `ProtectedSpan { token, category, value }`.

- [ ] **Step 1: Write failing table tests for every protected category**

Use cases that include fenced code, inline code, `https://example.com/a?q=1`, `hi@example.com`, `/Users/yanxi/report.md`, `2026-08-28`, `¥199.00`, `42`, Chinese quotes, English quotes, and the negations `不要`, `必须`, `only`, `must not`.

```ts
it.each([
  ["code", "Run `npm test` now"],
  ["url", "Open https://example.com/a?q=1"],
  ["email", "Reply to hi@example.com"],
  ["path", "Read /Users/yanxi/report.md"],
  ["date", "Due 2026-08-28"],
  ["price", "Budget is ¥199.00"],
  ["number", "Return exactly 42 rows"],
  ["quote", "保留“这段原文”"],
  ["constraint", "不要删除数字，必须保留链接"]
])("round-trips %s spans", (_category, input) => {
  const protectedDoc = protectSpans(input);
  expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
});
```

Add a test proving literal private-use placeholder-looking characters in user input also round-trip unchanged.

- [ ] **Step 2: Run the protection test and verify red**

Run: `npx vitest run packages/transformer/src/protect.test.ts`

Expected: FAIL because `protectSpans` and `restoreSpans` do not exist.

- [ ] **Step 3: Implement ordered extraction with collision-safe tokens**

Define categories as `code_block | inline_code | url | email | path | date | price | number | quote | constraint`. Match longer and more structured categories before numbers so pieces of URLs, dates, and prices are not split. Generate tokens from a per-document nonce plus the span index, and retain the exact original value.

```ts
export interface ProtectedSpan {
  token: string;
  category: ProtectedCategory;
  value: string;
}

export interface ProtectedDocument {
  text: string;
  spans: readonly ProtectedSpan[];
}
```

Restoration must replace only tokens created in the same `ProtectedDocument` and must throw a typed `UnresolvedProtectedSpanError` if a required token is absent.

- [ ] **Step 4: Run protection tests and the full suite**

Run:

```bash
npx vitest run packages/transformer/src/protect.test.ts
npm test
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit protected spans**

```bash
git add packages/transformer/src/protect.ts packages/transformer/src/protect.test.ts
git commit -m "feat: preserve critical prompt spans"
```

---

### Task 3: Conservative Compact Mode

**Files:**
- Create: `packages/transformer/src/normalize.ts`
- Create: `packages/transformer/src/compact.ts`
- Create: `packages/transformer/src/compact.test.ts`
- Modify: `packages/transformer/src/index.ts`

**Interfaces:**
- Consumes: Protected text from `protectSpans` and locale from `TransformOptions`.
- Produces: `normalizeText(text): RewriteStageResult` and `compactText(text, locale): RewriteStageResult`, where `RewriteStageResult { text, changes }`.

- [ ] **Step 1: Write failing Compact-mode examples**

```ts
it.each([
  ["就是说我想让你帮我分析一下这个项目，然后呢给我三个步骤。", "分析这个项目，给出三个步骤。", "zh"],
  ["Could you please help me, basically, summarize this report in 5 bullets?", "Summarize this report in 5 bullets.", "en"],
  ["不要删除 2026-08-28 和 https://example.com。", "不要删除 2026-08-28 和 https://example.com。", "zh"]
] as const)("compacts safely", (input, output, locale) => {
  const result = transform(input, { mode: "compact", locale });
  expect(result.output).toBe(output);
});
```

Add tests for duplicate phrases, mixed Chinese/English input, multiline whitespace, already concise input, code-only input, and idempotency: `transform(result.output, options).output === result.output`.

- [ ] **Step 2: Run Compact tests and verify red**

Run: `npx vitest run packages/transformer/src/compact.test.ts`

Expected: FAIL because Compact mode still returns every input unchanged.

- [ ] **Step 3: Implement normalization and high-confidence rule tables**

Implement `normalizeText` without touching protected tokens. Define explicit anchored or punctuation-bounded filler rules for Chinese and English. Do not delete free-standing words through broad substring replacement.

```ts
const ZH_PREFIX_RULES = [
  /^(?:就是说|然后呢)[，,\s]*/u,
  /^(?:我想让你|请你|麻烦你)(?:帮我)?/u
];

const EN_PREFIX_RULES = [
  /^(?:could you please|please)\s+/iu,
  /^(?:help me to|help me)\s+/iu
];
```

Use separately tested punctuation cleanup after removal. Deduplicate only adjacent normalized clauses with exact equality; do not use semantic similarity.

- [ ] **Step 4: Compose Compact mode through protect, rewrite, and restore**

Update `transform` to:

```ts
const protectedDoc = protectSpans(input);
const normalized = normalizeText(protectedDoc.text);
const rewritten = compactText(normalized.text, resolvedLocale);
const output = restoreSpans(rewritten.text, protectedDoc.spans);
```

Return combined `changes`; leave metrics and fidelity at their baseline values until later tasks.

- [ ] **Step 5: Verify Compact mode**

Run:

```bash
npx vitest run packages/transformer/src/compact.test.ts
npm test
npm run typecheck
```

Expected: Compact fixtures pass, critical spans remain exact, and all commands exit 0.

- [ ] **Step 6: Commit Compact mode**

```bash
git add packages/transformer/src/normalize.ts packages/transformer/src/compact.ts packages/transformer/src/compact.test.ts packages/transformer/src/index.ts
git commit -m "feat: add conservative compact mode"
```

---

### Task 4: Structured Mode and Honest Metrics

**Files:**
- Create: `packages/transformer/src/structured.ts`
- Create: `packages/transformer/src/structured.test.ts`
- Create: `packages/transformer/src/metrics.ts`
- Create: `packages/transformer/src/metrics.test.ts`
- Modify: `packages/transformer/src/index.ts`

**Interfaces:**
- Consumes: Normalized protected text and resolved locale.
- Produces: `structureText(text, locale): RewriteStageResult`, `estimateTokens(text): number`, and `buildMetrics(before, after): TransformMetrics`.

- [ ] **Step 1: Write failing Structured-mode examples**

```ts
it("renders only explicit Chinese sections", () => {
  const result = transform(
    "帮我分析这个项目。背景是给新手使用。面向大学生。必须用通俗语言。请用表格输出。",
    { mode: "structured", locale: "zh" }
  );
  expect(result.output).toBe([
    "## 任务",
    "分析这个项目。",
    "",
    "## 背景",
    "给新手使用。",
    "",
    "## 受众",
    "大学生。",
    "",
    "## 要求",
    "- 必须用通俗语言。",
    "",
    "## 输出格式",
    "- 使用表格。"
  ].join("\n"));
  expect(result.output).not.toContain("## 约束\n");
});
```

Add English marker cases, unclassified-sentence preservation, a short prompt that stays natural language, and a case proving the transformer does not create a Role section.

- [ ] **Step 2: Write failing metric tests**

```ts
it("labels length increases without claiming savings", () => {
  const metrics = buildMetrics("分析项目", "## 任务\n分析项目");
  expect(metrics.charactersAfter).toBeGreaterThan(metrics.charactersBefore);
  expect(metrics.estimatedTokensBefore).toBeGreaterThan(0);
  expect(metrics.estimatedTokensAfter).toBeGreaterThan(0);
});
```

Test empty text as zero and deterministic estimates for CJK, Latin words, punctuation, and mixed input. Exact estimates are internal heuristics, not model-specific tokenization.

- [ ] **Step 3: Run both test files and verify red**

Run: `npx vitest run packages/transformer/src/structured.test.ts packages/transformer/src/metrics.test.ts`

Expected: FAIL because structured rendering and metrics modules do not exist.

- [ ] **Step 4: Implement explicit-marker classification and rendering**

Split on sentence boundaries outside protected tokens. Use ordered locale-specific marker tables for Task, Background, Audience, Requirements, Constraints, and Output Format. Strip only the matched framing marker, preserve clause content, and append unmatched clauses to Task so nothing silently disappears.

Render headings in the input locale. Use bullets for multi-item requirements, constraints, and output format. If fewer than two useful sections are present, return the compact natural-language result instead of adding a single Markdown heading.

- [ ] **Step 5: Implement deterministic estimate metrics**

`estimateTokens` uses a documented local heuristic: count CJK code points individually, group Latin letters/digits into word-like runs, and count remaining non-whitespace punctuation. Convert the weighted sum to a non-negative integer with `Math.ceil`. Do not import a model tokenizer or make a network request.

`transform` adds an informational `result_longer` warning whenever `charactersAfter > charactersBefore`.

- [ ] **Step 6: Verify Structured mode and metrics**

Run:

```bash
npx vitest run packages/transformer/src/structured.test.ts packages/transformer/src/metrics.test.ts
npm test
npm run typecheck
```

Expected: all commands exit 0 and the longer-result case has `severity: "info"`.

- [ ] **Step 7: Commit Structured mode and metrics**

```bash
git add packages/transformer/src/structured.ts packages/transformer/src/structured.test.ts packages/transformer/src/metrics.ts packages/transformer/src/metrics.test.ts packages/transformer/src/index.ts
git commit -m "feat: add structured prompts and metrics"
```

---

### Task 5: Fidelity Validation and Replacement Safety

**Files:**
- Create: `packages/transformer/src/fidelity.ts`
- Create: `packages/transformer/src/fidelity.test.ts`
- Modify: `packages/transformer/src/index.ts`
- Modify: `packages/transformer/src/index.test.ts`

**Interfaces:**
- Consumes: Original string, final output, and protected spans.
- Produces: `validateFidelity(original, output, spans): TransformWarning[]`; `TransformResult.safeToReplace` is false when any warning has severity `error`.

- [ ] **Step 1: Write failing preservation and severity tests**

```ts
it.each([
  ["Keep 42 rows", "Keep rows", "number"],
  ["不要删除附件", "删除附件", "negation"],
  ["Open https://example.com", "Open the site", "url"],
  ["Run `npm test`", "Run tests", "inline_code"]
])("blocks replacement when %s loses critical content", (before, after, category) => {
  const protectedDoc = protectSpans(before);
  const warnings = validateFidelity(before, after, protectedDoc.spans);
  expect(warnings).toContainEqual(expect.objectContaining({
    code: "critical_content_missing",
    severity: "error",
    category
  }));
});
```

Add tests proving reordered but exact critical values remain safe, unchanged concise input returns `nothing_to_tidy`, and code/link-only input returns `only_protected_content` without destructive output.

Add a `fast-check` property test that generates arrays of integers, URLs built from a controlled safe alphabet, and negation-marked clauses. For every generated prompt, assert that critical-value multisets are unchanged after `transform`, no internal protection token remains in output, and applying the same transformation twice is stable.

- [ ] **Step 2: Run fidelity tests and verify red**

Run: `npx vitest run packages/transformer/src/fidelity.test.ts`

Expected: FAIL because `validateFidelity` does not exist.

- [ ] **Step 3: Implement category-aware critical extraction and comparison**

Compare exact multisets, not substring presence alone. Detect negations separately in original and output. Generate one error per missing category without placing the missing user value in warning messages, so diagnostics remain safe to display or store.

- [ ] **Step 4: Finish the transform orchestration**

The final `transform` sequence is:

```ts
validateInput(input);
const protectedDoc = protectSpans(input);
const normalized = normalizeText(protectedDoc.text);
const rewritten = options.mode === "structured"
  ? structureText(normalized.text, resolvedLocale)
  : compactText(normalized.text, resolvedLocale);
const output = restoreSpans(rewritten.text, protectedDoc.spans);
const fidelityWarnings = validateFidelity(input, output, protectedDoc.spans);
const metrics = buildMetrics(input, output);
return {
  output,
  changes: [...normalized.changes, ...rewritten.changes],
  warnings: [...contentWarnings, ...fidelityWarnings, ...lengthWarnings],
  metrics,
  safeToReplace: fidelityWarnings.every((warning) => warning.severity !== "error")
};
```

Catch `UnresolvedProtectedSpanError` only at the public boundary, return the unchanged original, add a `critical_content_missing` error, and set `safeToReplace: false`.

- [ ] **Step 5: Verify the complete transformer**

Run:

```bash
npm test --workspace @prompt-tidy/transformer
npm test
npm run typecheck
```

Expected: all transformer modes and preservation invariants pass.

- [ ] **Step 6: Commit fidelity validation**

```bash
git add packages/transformer/src/fidelity.ts packages/transformer/src/fidelity.test.ts packages/transformer/src/index.ts packages/transformer/src/index.test.ts
git commit -m "feat: block unsafe prompt replacements"
```

---

### Task 6: ChatGPT Composer Adapter

**Files:**
- Create: `extension/src/chatgpt/adapter.ts`
- Create: `extension/src/chatgpt/adapter.test.ts`

**Interfaces:**
- Consumes: ChatGPT page DOM.
- Produces: `ComposerAdapter` with `findComposer`, `readDraft`, `replaceDraft`, and `findMountPoint`; `ReplacementError` for verified write failures.

- [ ] **Step 1: Write failing adapter discovery and read tests**

Use jsdom fixtures for a semantic `contenteditable="true"` composer inside a form, a textarea fallback, and an unrelated editable element outside the message form.

```ts
it("finds the semantic message composer and reads its draft", () => {
  document.body.innerHTML = `
    <form data-type="composer"><div contenteditable="true" role="textbox"><p>分析这个项目</p></div></form>
    <div contenteditable="true">unrelated</div>`;
  const composer = chatGptAdapter.findComposer();
  expect(composer?.getAttribute("role")).toBe("textbox");
  expect(chatGptAdapter.readDraft(composer!)).toBe("分析这个项目");
});
```

- [ ] **Step 2: Write failing replacement-event and verification tests**

Assert that `replaceDraft` updates text, dispatches bubbling `beforeinput`, `input`, and `change` events, restores focus, and throws `ReplacementError` if a test double prevents the DOM value from changing.

- [ ] **Step 3: Run adapter tests and verify red**

Run: `npx vitest run extension/src/chatgpt/adapter.test.ts --environment jsdom`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement semantic selector fallbacks and verified writes**

Define selectors as named constants ordered from semantic attributes to narrowly scoped form structure. Do not use a generated CSS class as the only locator. Handle contenteditable and textarea composers through separate internal strategies while exposing the same interface.

```ts
export interface ComposerAdapter {
  findComposer(root?: ParentNode): HTMLElement | null;
  readDraft(composer: HTMLElement): string;
  replaceDraft(composer: HTMLElement, text: string): void;
  findMountPoint(composer: HTMLElement): HTMLElement | null;
}
```

`findMountPoint` returns a stable composer-control container and never mounts inside the editable region.

- [ ] **Step 5: Verify adapter isolation**

Run:

```bash
npx vitest run extension/src/chatgpt/adapter.test.ts --environment jsdom
npm test
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the adapter**

```bash
git add extension/src/chatgpt/adapter.ts extension/src/chatgpt/adapter.test.ts
git commit -m "feat: add ChatGPT composer adapter"
```

---

### Task 7: Idempotent Mounting, Mode Preference, and Tidy Button

**Files:**
- Create: `extension/src/chatgpt/observer.ts`
- Create: `extension/src/chatgpt/observer.test.ts`
- Create: `extension/src/settings/mode-store.ts`
- Create: `extension/src/settings/mode-store.test.ts`
- Create: `extension/src/ui/app.tsx`
- Create: `extension/src/ui/app.test.tsx`
- Create: `extension/src/ui/styles.ts`
- Modify: `extension/src/content/index.tsx`

**Interfaces:**
- Consumes: `ComposerAdapter`, transformer `transform`, and `chrome.storage.local`.
- Produces: `startComposerObserver({ adapter, onComposer }): () => void`, `ModeStore.get/set`, and one Shadow DOM `prompt-tidy-root` per active composer.

- [ ] **Step 1: Write failing observer tests**

Use fake timers to assert initial discovery, debounced discovery after DOM replacement, no duplicate callback for the same connected composer, and rediscovery when the old composer is disconnected.

```ts
it("mounts once per connected composer", async () => {
  const onComposer = vi.fn();
  const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
  document.body.append(makeComposerFixture());
  await vi.advanceTimersByTimeAsync(25);
  await vi.advanceTimersByTimeAsync(25);
  expect(onComposer).toHaveBeenCalledTimes(1);
  stop();
});
```

- [ ] **Step 2: Write failing mode-store privacy tests**

Mock `chrome.storage.local`. Assert the only written object is `{ mode: "compact" }` or `{ mode: "structured" }`; reject unknown values and default to `compact`. The API must not accept a draft parameter.

- [ ] **Step 3: Write the failing Tidy-button test**

Render `App` inside a Shadow Root with a fake adapter. Assert the button text is `整理`, it is disabled for an empty draft, and clicking it reads the draft once but does not write or send anything.

- [ ] **Step 4: Run observer, store, and button tests and verify red**

Run:

```bash
npx vitest run extension/src/chatgpt/observer.test.ts extension/src/settings/mode-store.test.ts extension/src/ui/app.test.tsx --environment jsdom
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 5: Implement the observer and narrow mode store**

Use a debounced `MutationObserver` over `document.body`. Track the mounted composer by element identity and `isConnected`. Return a cleanup function that disconnects the observer and cancels any pending timer.

Expose only:

```ts
export interface ModeStore {
  get(): Promise<TransformMode>;
  set(mode: TransformMode): Promise<void>;
}
```

- [ ] **Step 6: Mount a Shadow DOM app without duplicating roots**

`content/index.tsx` starts the observer. For each composer, locate the mount point, remove only a stale Prompt Tidy root owned by the extension, create a host with `data-prompt-tidy-root`, attach a closed-over Shadow DOM reference, inject the CSS string, and render `<App>`.

The initial App observes composer `input` events to enable or disable `整理`. Clicking the button computes the current result but does not yet replace text; Task 8 supplies the preview UI.

- [ ] **Step 7: Verify mount behavior and build**

Run:

```bash
npx vitest run extension/src/chatgpt/observer.test.ts extension/src/settings/mode-store.test.ts extension/src/ui/app.test.tsx --environment jsdom
npm test
npm run typecheck
npm run build
```

Expected: one root per composer, no draft persistence, and all commands exit 0.

- [ ] **Step 8: Commit mounting and button behavior**

```bash
git add extension/src/chatgpt extension/src/settings extension/src/ui extension/src/content/index.tsx
git commit -m "feat: mount local tidy control in ChatGPT"
```

---

### Task 8: Preview, Explicit Replacement, and Accessible Errors

**Files:**
- Create: `extension/src/ui/preview-panel.tsx`
- Create: `extension/src/ui/preview-panel.test.tsx`
- Modify: `extension/src/ui/app.tsx`
- Modify: `extension/src/ui/app.test.tsx`
- Modify: `extension/src/ui/styles.ts`

**Interfaces:**
- Consumes: `TransformResult`, `ComposerAdapter.replaceDraft`, and `ModeStore`.
- Produces: `PreviewPanel` with mode switch, metrics, warnings, cancel, acknowledgement, and replacement callbacks.

- [ ] **Step 1: Write failing preview content tests**

Render a result containing Markdown characters as text. Assert the panel shows original/result character counts, both estimated-token labels, the disclaimer `Token 为本地估算，并非账单数据`, and a longer-result notice when `result_longer` is present. Assert no result content is parsed into HTML.

- [ ] **Step 2: Write failing safety interaction tests**

Cover these exact behaviors:

- Cancel closes the panel and never calls `replaceDraft`.
- Safe result enables `替换到输入框` immediately.
- Warning result requires checking `我已核对关键内容` before replacement.
- Error result keeps replacement disabled.
- Switching Compact/Structured recomputes from the unchanged original draft and stores only the mode.
- Successful replacement closes the panel and focuses the composer.
- `ReplacementError` leaves the panel open with `替换失败，原内容已保留`.

- [ ] **Step 3: Run preview tests and verify red**

Run:

```bash
npx vitest run extension/src/ui/preview-panel.test.tsx extension/src/ui/app.test.tsx --environment jsdom
```

Expected: FAIL because `PreviewPanel` does not exist.

- [ ] **Step 4: Implement semantic dialog and explicit confirmation**

Use `role="dialog"`, `aria-modal="true"`, a labeled title, keyboard Escape for cancel, and focus trapping between interactive controls. Render user text inside `<pre>` using Preact text interpolation. Never use `dangerouslySetInnerHTML`.

The replacement handler rereads the composer before writing. If it differs from the preview's original draft, stop and show `输入内容已变化，请重新整理` so newer user typing cannot be overwritten.

- [ ] **Step 5: Finish visual states and local copy**

Keep the button visually secondary to ChatGPT Send. Define light and dark color tokens inside the Shadow DOM CSS, a maximum panel height with internal scrolling, visible focus outlines, and responsive width capped at 560px. Do not copy proprietary ChatGPT icons or assets.

- [ ] **Step 6: Verify preview behavior and full build**

Run:

```bash
npx vitest run extension/src/ui/preview-panel.test.tsx extension/src/ui/app.test.tsx --environment jsdom
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0; only explicit confirmed replacement invokes the adapter.

- [ ] **Step 7: Commit the preview flow**

```bash
git add extension/src/ui
git commit -m "feat: preview and confirm tidy replacements"
```

---

### Task 9: Packaged Extension E2E and Network Invariant

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/fixtures/chatgpt-composer.html`
- Create: `tests/e2e/extension.spec.ts`
- Create: `tests/privacy/no-network.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `extension/dist`, controlled ChatGPT-like fixture, and Chrome extension ID discovered from the service worker.
- Produces: automated packaged-extension flow and privacy regression tests.

- [ ] **Step 1: Add Playwright browser installation and failing E2E fixture**

Run: `npx playwright install chromium`

Create a fixture page with a form, semantic contenteditable composer, mount-point controls, and a fake Send button that records clicks. The fixture must be served at `http://127.0.0.1`; extend the test build manifest only in the test output to include this origin, leaving the production manifest unchanged.

Write an E2E test that types the agreed Chinese sample, clicks `整理`, selects Structured, verifies preview text, clicks `替换到输入框`, and asserts the fake Send click count remains zero.

- [ ] **Step 2: Write the failing network-invariant test**

Before user input, attach Playwright listeners for `request` and browser-context WebSocket events. After tidying, filter requests initiated by the extension origin; assert there are none beyond loading packaged static extension resources. Include `navigator.sendBeacon` and page-level fetch/XHR spies in the fixture.

- [ ] **Step 3: Run E2E and verify red for missing harness details**

Run:

```bash
npm run build
npm run test:e2e -- tests/e2e/extension.spec.ts tests/privacy/no-network.spec.ts
```

Expected: FAIL until persistent-context loading, test manifest generation, and fixture serving are configured.

- [ ] **Step 4: Implement the persistent Chromium harness**

Configure Playwright with one worker, a temporary user-data directory, `--disable-extensions-except=<absolute dist path>`, and `--load-extension=<absolute dist path>`. Start a local static fixture server from `webServer`. Generate the test-only manifest in a temporary build directory during global setup and remove it during teardown.

- [ ] **Step 5: Verify packaged behavior, privacy, and re-render recovery**

Extend E2E to replace the composer node, confirm `整理` remounts exactly once, test empty-input disabling, and test that changed input blocks stale preview replacement.

Run:

```bash
npm run build
npm run test:e2e
npm test
npm run typecheck
```

Expected: all commands exit 0; zero Send clicks; zero extension-originated application network calls.

- [ ] **Step 6: Commit packaged tests**

```bash
git add package.json package-lock.json playwright.config.ts tests
git commit -m "test: verify packaged extension privacy and flow"
```

---

### Task 10: Compatibility Popup, Open-source Documentation, and Release Check

**Files:**
- Create: `extension/popup.html`
- Create: `extension/src/popup/index.ts`
- Create: `extension/src/popup/index.test.ts`
- Create: `extension/vite.popup.config.ts`
- Modify: `extension/manifest.json`
- Modify: `extension/vite.config.ts`
- Modify: `extension/package.json`
- Modify: `extension/src/content/index.tsx`
- Create: `README.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `docs/privacy.md`
- Create: `docs/contributing.md`
- Create: `scripts/check-package.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: non-sensitive `CompatibilityStatus { state, adapterVersion, checkedAt, errorCategory? }` written by the content script.
- Produces: extension action popup, contributor/release documentation, and `npm run check:package`.

- [ ] **Step 1: Write the failing popup status test**

Mock `chrome.storage.local.get("compatibilityStatus")`. Assert the popup renders `ChatGPT 输入框已识别` for `supported`, `当前页面未找到输入框` for `unsupported`, and never renders arbitrary stored draft-like fields.

- [ ] **Step 2: Run popup test and verify red**

Run: `npx vitest run extension/src/popup/index.test.ts --environment jsdom`

Expected: FAIL because popup files do not exist.

- [ ] **Step 3: Implement bounded compatibility status**

Define:

```ts
interface CompatibilityStatus {
  state: "supported" | "unsupported" | "unknown";
  adapterVersion: "1";
  checkedAt: string;
  errorCategory?: "composer_not_found" | "mount_not_found" | "replacement_failed";
}
```

The content script writes only this object on adapter-state transitions, never on each keystroke. Add `default_popup: "popup.html"`. Create `vite.popup.config.ts` to build `popup.html` into the existing `dist` directory with `emptyOutDir: false`, then change the extension build script to run the content build followed by the popup build.

- [ ] **Step 4: Write exact public documentation**

README sections must include: what Prompt Tidy does, local unpacked installation, Compact versus Structured examples, privacy, limitations, development commands, testing, packaging, compatibility date, and contribution link. Do not add a screenshot section until a real reviewed asset exists.

Use this claim verbatim near the top:

> Prompt Tidy does not guarantee that Markdown reduces tokens. It removes high-confidence redundancy and makes explicit constraints easier to inspect, which may reduce follow-up turns.

`docs/privacy.md` states that prompts stay in active-tab memory, no prompt text is stored or transmitted, the last mode and non-sensitive compatibility status are the only local records, and uninstalling removes extension storage. `SECURITY.md` asks reporters not to include real prompt content. `docs/contributing.md` explains protected-span fixtures, red-green-refactor, adapter fixture updates, live smoke tests, and the no-network invariant.

Add the standard MIT license text with copyright `2026 Prompt Tidy contributors`.

- [ ] **Step 5: Add a package-policy checker**

Create `scripts/check-package.mjs` to read `extension/dist/manifest.json`, fail unless host permissions equal `['https://chatgpt.com/*']`, fail on forbidden permissions (`tabs`, `cookies`, `clipboardRead`, `clipboardWrite`, `history`, `webRequest`), scan built JavaScript for `http://` or `https://` application endpoints, and verify `content.js`, `popup.html`, and the popup bundle exist.

Add:

```json
"check:package": "npm run build && node scripts/check-package.mjs"
```

- [ ] **Step 6: Run the complete release gate**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run check:package
git status --short
```

Expected: all test/build commands exit 0; the package checker prints `Prompt Tidy package policy: PASS`; `git status --short` lists only the intended uncommitted Task 10 files.

- [ ] **Step 7: Perform the documented live ChatGPT smoke test**

Load `extension/dist` as an unpacked extension in Chrome, open `https://chatgpt.com/`, and verify:

1. `整理` appears once beside the active composer.
2. Empty input disables the button.
3. The agreed Chinese sample opens a preview in both modes.
4. Cancel leaves the draft unchanged.
5. Replacement changes the draft without sending it.
6. A new ChatGPT conversation remounts one button.
7. The popup reports supported status.
8. DevTools Network shows no Prompt Tidy application request during transformation.

Record only pass/fail, Chrome version, date, and adapter version in README compatibility metadata; never record prompt content.

- [ ] **Step 8: Commit the open-source release candidate**

```bash
git add extension README.md LICENSE SECURITY.md docs/privacy.md docs/contributing.md scripts/check-package.mjs package.json package-lock.json
git commit -m "docs: prepare Prompt Tidy open-source release"
git status --short --branch
```

Expected: branch is clean and contains ten focused implementation commits after the design and plan commits.

## Final Acceptance

Run from repository root:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run check:package
```

Then repeat the eight-item live ChatGPT smoke test. The MVP is complete only when automated checks pass, the production manifest has minimal permissions, the live composer flow works without automatic sending, and no prompt text leaves the browser or enters persistent storage.
