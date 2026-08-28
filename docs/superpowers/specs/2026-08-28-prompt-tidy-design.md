# Prompt Tidy MVP Design

Date: 2026-08-28
Status: Approved

## 1. Product Summary

Prompt Tidy is an open-source Chrome extension that adds a **Tidy** button beside the ChatGPT message composer. It converts conversational, repetitive input into clearer text or structured Markdown entirely in the browser. The user previews the result and explicitly chooses whether to replace the original draft. The extension never sends the message automatically.

The product does not claim that Markdown inherently reduces token usage. Its value is clearer instructions, less redundant input, and fewer clarification turns. When formatting makes the prompt longer, the UI says so plainly.

## 2. Goals

The MVP must:

- Work on the ChatGPT web application at `https://chatgpt.com/`.
- Add a visible **Tidy** button near the active composer.
- Support two deterministic local modes: Compact and Structured.
- Show the original and transformed drafts before replacement.
- Preserve meaning, especially numbers, negations, links, paths, quoted text, and code.
- Make no network request with user text.
- Store no prompt history or prompt content.
- Remain maintainable when ChatGPT changes its page structure.
- Be straightforward to install, audit, test, fork, and contribute to on GitHub.

## 3. Non-goals

The MVP will not:

- Send ChatGPT messages automatically.
- Read or transform conversation history.
- Call an external AI API or require an API key.
- Ship an on-device language model.
- Support browsers other than Chromium-based browsers.
- Support Claude, Gemini, or other chat websites.
- Synchronize prompt history or user accounts.
- Guarantee reduced tokens or better model output for every prompt.
- Invent missing requirements, roles, facts, or constraints.

## 4. User Experience

### 4.1 Entry point

When a non-empty ChatGPT composer is active, the extension displays a **Tidy** button near the existing composer controls. The button is disabled for empty drafts.

The extension observes page and composer re-renders so the button is restored after navigation, new-chat creation, or relevant DOM replacement. It must not add duplicate buttons.

### 4.2 Preview flow

1. The user writes a draft in the ChatGPT composer.
2. The user clicks **Tidy**.
3. A preview panel opens with Compact and Structured mode controls.
4. The panel shows the original draft, transformed draft, character counts, estimated token counts, and warnings.
5. The user chooses **Cancel** or **Replace in composer**.
6. Replacement updates the composer through the page adapter and emits the input events required for ChatGPT to recognize the change.
7. The user remains responsible for clicking ChatGPT's Send control.

Closing or cancelling the preview leaves the original draft unchanged.

### 4.3 Modes

**Compact** removes safe filler, duplicated phrasing, and unnecessary conversational framing. It favors a short natural-language prompt and adds no headings unless they materially improve readability.

**Structured** classifies explicit content into sections such as Task, Background, Audience, Requirements, Constraints, and Output Format. Empty sections are omitted. It does not infer facts or requirements that the user did not provide.

### 4.4 Metrics and claims

The preview displays:

- Original and result character counts.
- Character-count change and percentage.
- Clearly labeled estimated token counts.
- A notice when Markdown structure increases prompt length.

Token estimates are advisory because ChatGPT may use different tokenizers and model versions. README and interface copy must not present estimates as billing data or promise that Markdown saves tokens.

## 5. Architecture

The repository separates host-page integration, UI, and transformation logic:

```text
prompt-tidy/
├── extension/
│   ├── manifest.json
│   └── src/
│       ├── content/
│       │   ├── chatgpt-adapter.ts
│       │   ├── mount.ts
│       │   └── observer.ts
│       ├── ui/
│       │   ├── tidy-button.tsx
│       │   └── preview-panel.tsx
│       └── settings/
├── packages/
│   └── transformer/
│       ├── src/
│       └── tests/
├── tests/
│   ├── fixtures/
│   └── e2e/
├── docs/
│   ├── privacy.md
│   └── contributing.md
├── README.md
├── LICENSE
└── SECURITY.md
```

The planned stack is TypeScript, Chrome Manifest V3, Vite, Vitest, Playwright, and Preact or an equivalently small view layer. The repository uses the MIT License.

### 5.1 ChatGPT adapter

The adapter is the only module allowed to know ChatGPT-specific DOM details. Its public interface is:

```ts
interface ComposerAdapter {
  findComposer(): HTMLElement | null;
  readDraft(composer: HTMLElement): string;
  replaceDraft(composer: HTMLElement, text: string): void;
  findMountPoint(composer: HTMLElement): HTMLElement | null;
}
```

Selectors are ordered fallbacks based first on stable semantic attributes and roles, then on narrowly scoped structural fallbacks. Fragile class names are not treated as the sole selector. Replacement verifies that the composer contains the expected result after required DOM events are dispatched.

### 5.2 Content script and observer

A Manifest V3 content script runs only on the ChatGPT origin in Chrome's isolated world. A debounced `MutationObserver` detects relevant page changes, finds the current composer, and idempotently mounts the extension UI. The observer does not read or retain conversation content.

### 5.3 UI isolation

The extension UI is mounted in a Shadow DOM root to limit CSS collisions with ChatGPT. The preview uses safe text rendering; transformed content is assigned as text rather than interpreted as HTML. Keyboard focus returns predictably to the composer or triggering button when the panel closes.

### 5.4 Transformer package

The transformer is a deterministic TypeScript package without DOM or Chrome dependencies:

```ts
type TransformMode = "compact" | "structured";

interface TransformOptions {
  mode: TransformMode;
  locale?: "auto" | "zh" | "en";
}

interface TransformResult {
  output: string;
  changes: ChangeSummary[];
  warnings: TransformWarning[];
  metrics: {
    charactersBefore: number;
    charactersAfter: number;
    estimatedTokensBefore: number;
    estimatedTokensAfter: number;
  };
}

declare function transform(
  input: string,
  options: TransformOptions
): TransformResult;
```

The same input, options, and transformer version always produce the same result.

## 6. Transformation Pipeline

### 6.1 Protect spans

Before rewriting, the transformer extracts protected spans and replaces them with internal placeholders. Protected spans include fenced and inline code, URLs, email addresses, filesystem paths, dates, prices, numbers, quoted passages, and explicit constraint markers.

### 6.2 Normalize

The transformer normalizes line endings and excessive whitespace while preserving paragraph and list intent. It does not normalize inside protected spans.

### 6.3 Remove safe filler

Locale-specific rules remove only high-confidence filler and immediately duplicated phrases. Rules are conservative and versioned. Negations, modal requirements, quantities, names, and degree words are excluded from destructive rules.

### 6.4 Classify explicit statements

Structured mode uses deterministic markers to classify clauses into Task, Background, Audience, Requirements, Constraints, and Output Format. Unclassified content stays in the result rather than being discarded. Sections with no explicit content are omitted.

### 6.5 Render

Compact mode renders a concise natural-language prompt. Structured mode renders only useful Markdown headings and bullets. The renderer avoids formatting whose overhead outweighs its readability benefit for short input.

### 6.6 Restore and validate

Protected spans are restored verbatim. A fidelity validator compares critical content before and after transformation. A warning is produced when a number, URL, email, path, quote, code span, negation, or explicit requirement cannot be matched. Risky results require visible acknowledgement before replacement; severe validation failures disable replacement and leave the original draft intact.

## 7. Privacy and Security

- Prompt text remains in the active tab's memory for the duration of transformation and preview.
- No prompt content, history, transformation result, or analytics event is persisted.
- The MVP contains no telemetry and makes no application network requests.
- Only non-sensitive preferences, such as the last selected mode, may be stored with `chrome.storage.local`.
- Host permissions are limited to `https://chatgpt.com/*`.
- The extension requests no broad browsing-history, tabs, cookies, clipboard, or remote-code permissions.
- Content from the page and transformer is rendered as text, not trusted HTML.
- Diagnostic errors may contain adapter version, selector path identifier, and error category, but never draft content.
- The repository includes a plain-language privacy document and a security reporting policy.

## 8. Error Handling

- **Empty input:** Tidy is disabled.
- **Input below the usefulness threshold:** Explain that no meaningful tidying is available and keep the original.
- **Only code or links:** Return unchanged with an explanation.
- **No safe transformation:** Return unchanged rather than forcing a rewrite.
- **Fidelity warning:** Display the affected categories and require acknowledgement.
- **Severe fidelity failure:** Disable replacement.
- **Composer not found:** Do not inject UI; expose a non-sensitive compatibility status through the extension action.
- **Replacement verification fails:** Restore the original draft when possible and show a local error.
- **Unexpected exception:** Keep the original draft, discard transient transformed output, and expose a retry action.

## 9. Testing Strategy

### 9.1 Unit tests

Table-driven fixtures cover Chinese, English, mixed-language, punctuation, repeated phrasing, and each protected-span category. Tests assert deterministic output, exact preservation of protected spans, conservative handling of negation, and correct warnings.

### 9.2 Property and invariant tests

Generated cases verify that protected tokens survive transformation, output never contains unresolved placeholders, severe validation failures cannot be marked safe, and applying the same transformation twice is stable where practical.

### 9.3 Adapter tests

DOM fixtures represent supported composer shapes. Tests cover discovery, reading, replacement, required event dispatch, idempotent mounting, re-render recovery, and graceful failure when selectors no longer match.

### 9.4 End-to-end tests

Playwright runs against a controlled ChatGPT-like fixture rather than relying on a live authenticated account in continuous integration. A documented manual smoke test covers the live ChatGPT site before release.

### 9.5 Privacy tests

Automated tests fail if normal transformation triggers `fetch`, `XMLHttpRequest`, `WebSocket`, or beacon calls. Build review verifies that the packaged extension contains no remotely hosted executable code.

## 10. Release and Compatibility

The first release is an unpacked developer build distributed through GitHub Releases with installation instructions. Chrome Web Store publication is a later distribution step and does not change the MVP's behavior.

Each release records:

- Supported ChatGPT origin and manually verified date.
- Adapter version.
- Transformer rule version.
- Known compatibility limitations.

Compatibility breakage caused by ChatGPT DOM changes is handled by updating only the adapter and its fixtures unless the public adapter contract must change.

## 11. Success Criteria

The MVP is ready when:

- A user can install it locally and tidy a ChatGPT draft without configuration.
- Compact and Structured modes work for the agreed Chinese and English fixture set.
- Critical content preservation tests pass.
- The preview never replaces or sends text without explicit user action.
- Normal use produces no extension-originated network requests.
- The button survives tested ChatGPT navigation and composer re-render scenarios.
- The packaged extension asks only for the documented minimal permissions.
- README language accurately distinguishes clarity improvement from token reduction.

Initial project evaluation should measure transformation acceptance rate, fidelity-warning rate, average character-count change, and fixture-based task-clarity reviews. Token savings are reported only as estimates, not as a guaranteed outcome.

## 12. Key Risks and Mitigations

**ChatGPT DOM changes:** Isolate selectors and composer behavior in one adapter, use semantic fallbacks, maintain fixtures, and publish compatibility metadata.

**Rule-based rewriting changes meaning:** Prefer unchanged output over low-confidence rewriting, protect critical spans, validate fidelity, and require preview confirmation.

**Formatting increases prompt size:** Use minimal Markdown, show before-and-after metrics, and disclose when the result prioritizes clarity rather than length.

**Users assume AI-level understanding:** Describe the MVP as deterministic local tidying, document limitations, and do not imply semantic reasoning that the rule engine does not perform.

**Privacy claim drifts over time:** Keep network behavior under automated test and require documentation updates for any future optional provider.

## 13. Future Extensions

Future work may add keyboard shortcuts, additional website adapters, user-defined local rules, an optional on-device model, or an explicit bring-your-own-provider mode. Each capability requires a separate design review, especially if it introduces network access or additional permissions.
