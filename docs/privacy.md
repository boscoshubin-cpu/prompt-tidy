# Prompt Tidy Privacy

Prompt Tidy processes the current draft entirely in the active tab. Prompt text and the transient transformation preview stay in active-tab memory for the duration of the interaction.

No prompt text, transformed text, conversation history, or page content is stored or transmitted. Prompt Tidy has no telemetry, analytics, account system, application API, or other application network endpoint.

The only local records are:

- the last selected mode (`compact` or `structured`); and
- a non-sensitive compatibility status containing only a support state, adapter version, check time, and optional bounded error category.

The compatibility status never contains prompt text, transformed text, conversation content, page HTML, selectors, URLs from a draft, or account data.

Both records use Chrome extension local storage. Uninstalling Prompt Tidy removes the extension and its local storage. Clearing extension data also removes these records.

The production extension runs only on `https://chatgpt.com/*`. It does not request tabs, cookies, clipboard, history, or web-request permissions.
