# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through the repository's GitHub Security Advisory feature. If that feature is unavailable, contact a maintainer before posting details publicly.

Describe the affected version, the smallest safe reproduction, expected behavior, and observed behavior. Do not include real prompt content, account details, cookies, tokens, conversation history, or other personal information. Use synthetic placeholders in reproductions and screenshots.

Please allow maintainers time to reproduce and address the report before public disclosure. Security reports are handled separately from ordinary compatibility bugs and feature requests.

## Security boundaries

Prompt Tidy is designed to transform only the active ChatGPT draft in the browser. It must not send prompt text to a network service, persist prompt content, read conversation history, or send a ChatGPT message automatically. Production host access is limited to `https://chatgpt.com/*`.
