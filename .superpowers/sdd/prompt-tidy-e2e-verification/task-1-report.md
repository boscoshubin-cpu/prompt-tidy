# Task 1 report: packaged preview assertion

## Changed files

- `tests/e2e/extension.spec.ts`
  - Kept the semantic `整理结果` region locator.
  - Scoped the exact Markdown assertion to that region's child `pre` output element.
- `.superpowers/sdd/prompt-tidy-e2e-verification/task-1-report.md`
  - This verification report.

No production files, dependencies, permissions, or runtime behavior were changed.

## RED evidence

Before the repair, the focused test failed as expected:

```text
npx playwright test tests/e2e/extension.spec.ts -g "tidies a draft in the packaged extension"
1 failed
Expected: "## 任务 ..."
Received: "整理结果## 任务 ..."
Locator: getByRole('dialog', { name: '整理预览' }).getByRole('region', { name: '整理结果' })
```

The failure was caused by asserting the entire region, which includes its `h3` heading (`整理结果`) in addition to the Markdown output.

## Verification commands and results

- `npx playwright test tests/e2e/extension.spec.ts -g "tidies a draft in the packaged extension"`: **1 passed**.
- `npx playwright test tests/e2e tests/privacy/no-network.spec.ts`: **6 passed**.
- `npm test`: **21 test files passed, 272 tests passed**.
- `npm run typecheck`: **passed**.
- `npm run check:package`: **passed** (`Prompt Tidy package policy: PASS`).
- `git diff --check`: **passed** with no output.

## Commit

Test-only repair commit: `1c67cd2` (`test: scope packaged preview assertion to output`).

Live ChatGPT smoke was **not claimed**; verification covered only the local packaged fixture and privacy E2E tests.
