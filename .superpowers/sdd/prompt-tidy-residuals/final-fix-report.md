# Prompt Tidy corrective final-fix report

Date: 2026-09-01

Base: `4531b2b2b60aa06a4347f5acc29db5d17374c079`

Implementation commit: `585a2b7f467bf97fa3659bb8b30e04491549051f`

Scope: the 2 Critical, 4 Important, and 1 Minor findings in `final-review-findings.md`.

## Outcome

All seven findings have code and regression coverage. The six required Critical/Important findings were fixed without adding dependencies, permissions, network behavior, a service worker, or automatic sending. The Minor finding was addressed with a low-risk popup label that explicitly describes storage-backed compatibility as the most recent result rather than the active tab's live state.

Packaged Playwright E2E remains enabled, but it did not execute because this machine has no compatible Playwright Chromium/Chrome executable. Live ChatGPT smoke was not run. Neither is claimed as passing.

## Finding-to-fix map and TDD evidence

### Critical 1 — Structured splitting corrupts dotted atoms

- Production: `packages/transformer/src/structured.ts` now treats a period as a sentence boundary only before whitespace/end-of-input. `packages/transformer/src/fidelity.ts` independently compares dotted-atom multisets and reports `dotted_atom` on corruption.
- Tests: `packages/transformer/src/structured.test.ts` exercises public `transform()` with `config.apiEndpoint`, `api.example.com`, and `client.auth.token`. `packages/transformer/src/fidelity.test.ts` calls `validateFidelity()` with no parser spans, so the fidelity regression does not depend on the protection parser.
- RED: `npx vitest run packages/transformer/src/structured.test.ts packages/transformer/src/fidelity.test.ts --reporter=verbose` produced 6 failures / 34 passes. Public output inserted spaces after internal dots, and independent fidelity returned no warning.
- GREEN: the same command produced 40 passes / 0 failures.

### Critical 2 — Multi-backtick and indented code are not protected

- Production: `packages/transformer/src/protect.ts` now scans one-or-more-backtick delimiter runs, preserves valid spans exactly, reports ambiguous/unclosed syntax, protects Markdown-indented blocks, and keeps existing fenced/legacy triple-backtick behavior.
- Tests: `packages/transformer/src/index.test.ts` exercises public `transform()` for double/four-backtick spans, unclosed syntax, and indented code. `packages/transformer/src/protect.test.ts` independently checks exact span values, ambiguity classification, restoration, and indented block classification.
- RED: `npx vitest run packages/transformer/src/protect.test.ts packages/transformer/src/index.test.ts --reporter=verbose` produced 7 failures / 44 passes: code whitespace changed, unclosed syntax remained replaceable, and indentation was stripped.
- GREEN: the same command produced 51 passes / 0 failures. An existing embedded-triple regression exposed a compatibility gap during GREEN; the minimal scanner compatibility adjustment was made before the final clean run.

### Important 1 — Filler-only input can become an empty replacement

- Production: `packages/transformer/src/index.ts` adds a restored-output non-empty postcondition. A non-empty input whose rewrite restores to empty returns the original input, no changes, original metrics, and a `nothing_to_tidy` result.
- Tests: `packages/transformer/src/index.test.ts` exercises public `transform()` for `请你` and `basically,` in both Compact and Structured modes.
- RED: `npx vitest run packages/transformer/src/index.test.ts --reporter=verbose` produced 4 failures / 10 passes; each result was `""`.
- GREEN: the same command produced 14 passes / 0 failures.

### Important 2 — Manifest policy is not an exact boundary

- Production: `scripts/check-package.mjs` now enforces an exact top-level MV3 allowlist, Manifest V3, reviewed name/description, a bounded Chrome version format, exact `storage` and ChatGPT host permissions, exact isolated/document-idle `content_scripts`, and exact popup `action` fields.
- Tests: `tests/package-policy.test.ts` copies and executes the real checker against temporary packages. It rejects `world: "MAIN"`, `run_at: "document_start"`, extra content-script/action fields, `chrome_url_overrides`, and a Manifest V2 downgrade.
- RED: `npx vitest run tests/package-policy.test.ts --reporter=verbose` produced 6 failures / 35 passes; all six unsafe manifests were accepted by the real checker.
- GREEN: after the manifest fix (before the next finding's cases), the same command produced 41 passes / 0 failures.

### Important 3 — Dynamic execution variants bypass the checker

- Production: `scripts/check-package.mjs` checks direct `Function` construction on a comment/string-masked code view, detects static `window`/`globalThis["Function"]` access, and detects string timers when comments occur between the callee and call. These are bounded common-syntax checks, not a claim of complete JavaScript parsing.
- Tests: `tests/package-policy.test.ts` executes the real checker for `Function/*audit*/(...)`, `globalThis["Function"](...)`, a commented `window['Function'](...)`, and commented `setTimeout`/`setInterval` calls. `custom['Function'](...)` remains an allowed non-global reference.
- RED: the real-checker run produced 5 failures / 42 passes; each newly added execution variant was accepted.
- GREEN: the same command produced 47 passes / 0 failures.

### Important 4 — Privacy E2E allows later same-URL traffic

- Production/test harness: `tests/privacy/no-network.spec.ts` records URL, method, resource type, and navigation status for every request. `tests/privacy/request-policy.ts` allows only the first application request when it is the exact fixture URL, `GET`, `document`, and a navigation; every later application request is unexpected.
- Tests: `tests/privacy/request-policy.test.ts` uses the same assertion as packaged E2E. Its negative control adds a later same-URL `POST`/`fetch`, verifies classification, and verifies that the real assertion throws.
- RED: after a behavior-preserving extraction of the old URL-only policy, `npx vitest run tests/privacy/request-policy.test.ts --reporter=verbose` produced 1 failure / 1 pass because the later POST was classified as allowed.
- GREEN: the same command produced 2 passes / 0 failures, including the assertion-throw negative control.

### Minor — Popup status can be overwritten by another tab

- Production: `extension/src/popup/index.ts` now prefixes every stored compatibility result with `最近一次检测：`, clearly presenting it as last-known storage state rather than active-tab truth. No tabs permission or new runtime messaging was introduced.
- Tests: `extension/src/popup/index.test.ts` checks the last-known label.
- RED: `npx vitest run extension/src/popup/index.test.ts --reporter=verbose` produced 1 failure / 4 passes because the stored result lacked the label.
- GREEN: the same command produced 5 passes / 0 failures.

## Final verification

- Focused Critical/Important suite: 6 test files, 144 tests passed.
- Final `npm test -- --reporter=dot`: 20 test files, 231 tests passed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0.
- `npm run check:package`: exit 0 and printed `Prompt Tidy package policy: PASS` after a fresh production build.
- `git diff --check`: exit 0 before the implementation commit.
- `npm run test:e2e`: attempted all 6 packaged tests, but all were blocked before test behavior ran because Playwright could not find `/Users/yanxi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
- Live ChatGPT smoke: not run.

## Constraint and scoped re-review audit

Exactly one scoped self-review was performed after the fix wave, against every finding and the approved design. It confirmed:

- `package.json`, `package-lock.json`, and `extension/manifest.json` are unchanged.
- No dependency was added.
- Permissions remain exactly `storage`; host access remains exactly `https://chatgpt.com/*`.
- No network API, endpoint, telemetry, service worker, background surface, or automatic-send path was added.
- Preview and explicit replacement semantics remain unchanged.
- Package policy is intentionally a bounded static audit and does not claim complete JavaScript parsing.

## Residuals and verification limits

- Finding residuals: none identified in the scoped review.
- Packaged E2E: BLOCKED by missing compatible browser executable; no packaged E2E pass claim.
- Live ChatGPT smoke: NOT RUN; no live compatibility claim.
- Dynamic-execution scanning: covers the reviewed common variants but remains a bounded static checker rather than a JavaScript parser.
