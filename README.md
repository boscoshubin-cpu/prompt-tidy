# Prompt Tidy

Prompt Tidy is an open-source Chrome extension that tidies a draft in the ChatGPT composer locally. It offers conservative Compact and Structured modes, shows a preview, and changes the composer only after explicit confirmation. It never sends the message for you.

> Prompt Tidy does not guarantee that Markdown reduces tokens. It removes high-confidence redundancy and makes explicit constraints easier to inspect, which may reduce follow-up turns.

## Install locally as an unpacked extension

Requirements: Node.js 22 or later and a Chromium-based browser that supports Manifest V3 extensions.

1. Clone or download this repository.
2. From the repository root, run `npm ci` and then `npm run build`.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Choose **Load unpacked** and select `extension/dist`.
6. Open `https://chatgpt.com/`. A non-empty active composer should show the `整理` control.

After changing source code, rebuild the extension and reload it from `chrome://extensions`.

## Compact and Structured

Compact removes only high-confidence filler and immediate duplication while keeping explicit facts and constraints.

```text
Input:  就是说我想让你帮我分析一下这个项目，然后呢给我三个步骤。
Output: 分析这个项目，给出三个步骤。
```

Structured groups only information already present in the draft. It does not invent empty sections or requirements.

```text
Input: 帮我分析这个项目。背景是给新手使用。面向大学生。必须用通俗语言。请用表格输出。

Output:
## 任务
分析这个项目。

## 背景
给新手使用。

## 受众
大学生。

## 要求
- 必须用通俗语言。

## 输出格式
- 使用表格。
```

Both modes run deterministically in the browser. The preview displays local character counts and approximate token counts; those estimates are not billing data.

## Privacy

Prompt text stays in the active tab's memory. It is not stored, transmitted, added to analytics, or sent to an application API. The extension stores only the last selected mode and a bounded, non-sensitive compatibility status. See the [privacy policy](docs/privacy.md) and [security policy](SECURITY.md).

## Limitations

- The production extension supports only `https://chatgpt.com/`.
- ChatGPT page changes can temporarily break composer discovery or replacement.
- The transformer is conservative; concise drafts, code-only input, and link-only input may be left unchanged.
- Token counts are estimates, and Markdown can make a prompt longer.
- Prompt Tidy does not send messages, read conversation history, call an AI API, or support non-Chromium browsers.

## Development commands

Run commands from the repository root:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

The build writes the unpacked extension to `extension/dist`.

## Testing

Unit and DOM fixture tests run with:

```bash
npm test
```

Packaged-extension tests use Playwright and require a compatible local Chromium/Chrome executable:

```bash
npm run test:e2e:install
npm run test:e2e
```

Before a release, also perform the live ChatGPT smoke test described in [Contributing](docs/contributing.md). Do not record prompt content in test notes.

## Packaging

Build the production extension and enforce the manifest, permission, asset, and no-endpoint package policy with:

```bash
npm run check:package
```

A passing check prints `Prompt Tidy package policy: PASS`. Distribute the contents of `extension/dist` without adding remote code or widening host permissions.

## Compatibility

| Field | Value |
| --- | --- |
| Supported origin | `https://chatgpt.com/` |
| Adapter version | `1` |
| Check date | 2026-08-29 |
| Live ChatGPT smoke | BLOCKED — not run |
| Chrome version | Unavailable — no compatible Chromium/Chrome executable was installed |

This metadata does not claim live compatibility. A release candidate remains unverified until the eight-item live smoke test passes in a compatible Chrome version.

## Contributing

Read [Contributing](docs/contributing.md) before changing transformation rules, ChatGPT adapters, or release behavior. By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
