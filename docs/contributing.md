# Contributing to Prompt Tidy

Prompt Tidy favors small, auditable changes that preserve user intent and keep prompt content local.

## Set up

Use Node.js 22.13 or later. From the repository root:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

## Red, green, refactor

Use red-green-refactor for every behavior change:

1. Add the smallest test that describes the desired behavior.
2. Run that test and confirm it fails for the expected missing behavior.
3. Add the minimum implementation that makes it pass.
4. Run the focused test and the full suite.
5. Refactor only while the suite remains green.

Do not weaken fidelity checks to make a transformation fixture pass.

## Transformer and protected-span fixtures

Every rule that can remove or move text needs literal input/output fixtures. Add fixtures for relevant Chinese, English, mixed-language, punctuation, whitespace, and repeated-clause cases.

Protected spans include code, links, email addresses, paths, dates, prices, numbers, quotations, negations, and explicit requirements. When a change touches protection or restoration, add a fixture that proves the protected bytes survive and that no internal placeholder reaches output. Derive expected output by hand rather than with transformer helpers.

## ChatGPT adapter fixtures

Keep ChatGPT-specific selectors and replacement behavior inside the adapter. When ChatGPT changes its composer markup:

1. Add or update a synthetic DOM fixture that represents the observed semantic structure without copying real conversation content.
2. Add a failing adapter or observer test.
3. Update the narrowest selector or adapter behavior needed.
4. Verify discovery, mount idempotence, replacement events, replacement verification, and remount behavior.

Do not add broad host permissions or fragile page-wide selectors as a shortcut.

## No-network invariant

Normal transformation must make no `fetch`, `XMLHttpRequest`, beacon, WebSocket, or other application network call. Prompt text must not enter extension storage. Changes involving dependencies, build output, permissions, or browser APIs must run the privacy tests and package-policy checker. Remote executable code and application endpoints are not allowed in the built extension.

## Automated release checks

Run the complete gate from the repository root:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run check:package
```

The Playwright checks require a compatible local Chromium/Chrome executable. Report a missing browser as a blocker; do not replace a browser run with source review.

## Live ChatGPT smoke test

Before release, load `extension/dist` as an unpacked extension in a compatible Chrome build, open `https://chatgpt.com/`, and verify:

1. `整理` appears exactly once beside the active composer.
2. Empty input disables the button.
3. The agreed synthetic Chinese sample opens a preview in Compact and Structured modes.
4. Cancel leaves the draft unchanged.
5. Replace changes the draft without sending it.
6. A new ChatGPT conversation remounts exactly one button.
7. The extension popup reports supported status.
8. DevTools Network shows no Prompt Tidy application request during transformation.

Use synthetic text. Record only pass/fail, Chrome version, date, and adapter version; never record prompt content.

## Pull requests

Keep commits focused and explain behavior and privacy effects. Include focused test output, full gate results, live-smoke metadata when performed, and any exact environmental blocker. Contributions are accepted under the repository's MIT License.
