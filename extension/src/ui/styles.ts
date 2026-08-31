export const promptTidyStyles = `
  :host {
    all: initial;
    --prompt-tidy-surface: #ffffff;
    --prompt-tidy-text: #1f2937;
    --prompt-tidy-muted: #4b5563;
    --prompt-tidy-border: #9ca3af;
    --prompt-tidy-accent: #2563eb;
    --prompt-tidy-focus: #f59e0b;
    color: var(--prompt-tidy-text);
    font-family: system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --prompt-tidy-surface: #1f2937;
      --prompt-tidy-text: #f9fafb;
      --prompt-tidy-muted: #d1d5db;
      --prompt-tidy-border: #6b7280;
      --prompt-tidy-accent: #93c5fd;
      --prompt-tidy-focus: #fbbf24;
    }
  }
  button {
    appearance: none;
    border: 1px solid var(--prompt-tidy-border);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--prompt-tidy-text);
    cursor: pointer;
    font: 500 0.875rem/1 system-ui, sans-serif;
    padding: 0.375rem 0.625rem;
  }
  button:hover:not(:disabled) { background: color-mix(in srgb, var(--prompt-tidy-accent) 12%, transparent); }
  button:disabled { cursor: not-allowed; opacity: 0.5; }
  button:focus-visible, input:focus-visible {
    outline: 3px solid var(--prompt-tidy-focus);
    outline-offset: 2px;
  }
  .prompt-tidy-preview {
    background: var(--prompt-tidy-surface);
    border: 1px solid var(--prompt-tidy-border);
    border-radius: 0.75rem;
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
    box-sizing: border-box;
    color: var(--prompt-tidy-text);
    font: 0.875rem/1.45 system-ui, sans-serif;
    left: 50%;
    max-height: min(44rem, calc(100vh - 2rem));
    overflow: auto;
    padding: 1rem;
    position: fixed;
    top: 1rem;
    transform: translateX(-50%);
    width: min(560px, calc(100vw - 2rem));
    z-index: 2147483647;
  }
  .prompt-tidy-preview h2, .prompt-tidy-preview h3 { margin: 0 0 0.5rem; }
  .prompt-tidy-preview section, .prompt-tidy-preview fieldset { margin: 0 0 0.875rem; }
  .prompt-tidy-preview fieldset { border: 1px solid var(--prompt-tidy-border); border-radius: 0.5rem; }
  .prompt-tidy-preview pre {
    background: color-mix(in srgb, var(--prompt-tidy-text) 7%, transparent);
    border-radius: 0.375rem;
    margin: 0;
    overflow-wrap: anywhere;
    padding: 0.625rem;
    white-space: pre-wrap;
  }
  .prompt-tidy-metrics, .prompt-tidy-disclaimer { color: var(--prompt-tidy-muted); }
  .prompt-tidy-operation-error { display: inline-flex; gap: 0.5rem; align-items: center; }
  .prompt-tidy-operation-error p { color: var(--prompt-tidy-text); margin: 0; }
  .prompt-tidy-preview-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
`;
