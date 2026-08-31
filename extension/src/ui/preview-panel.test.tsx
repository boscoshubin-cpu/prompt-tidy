import { fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TransformResult } from "@prompt-tidy/transformer";

import { PreviewPanel } from "./preview-panel";

function result(overrides: Partial<TransformResult> = {}): TransformResult {
  return {
    output: "Tidied prompt",
    changes: [],
    warnings: [],
    metrics: {
      charactersBefore: 14,
      charactersAfter: 13,
      estimatedTokensBefore: 4,
      estimatedTokensAfter: 4
    },
    safeToReplace: true,
    ...overrides
  };
}

function renderPanel(overrides: Partial<Parameters<typeof PreviewPanel>[0]> = {}) {
  const onCancel = vi.fn();
  const onModeChange = vi.fn();
  const onReplace = vi.fn();
  const view = render(
    <PreviewPanel
      original="Original prompt"
      result={result()}
      mode="compact"
      onCancel={onCancel}
      onModeChange={onModeChange}
      onReplace={onReplace}
      {...overrides}
    />
  );

  return { ...view, onCancel, onModeChange, onReplace };
}

describe("PreviewPanel", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders original and Markdown-shaped result as text with local metrics", () => {
    const { container } = renderPanel({
      result: result({
        output: "# Heading\n<em>not HTML</em>",
        warnings: [{
          code: "result_longer",
          severity: "info",
          message: "The tidied prompt is longer because formatting was added."
        }],
        metrics: {
          charactersBefore: 15,
          charactersAfter: 29,
          estimatedTokensBefore: 5,
          estimatedTokensAfter: 9
        }
      })
    });

    const dialog = container.querySelector("[role='dialog']")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("原始：15 字符");
    expect(dialog.textContent).toContain("结果：29 字符");
    expect(dialog.textContent).toContain("变化：+14 字符（+93.3%）");
    expect(dialog.textContent).toContain("原始：约 5 Token");
    expect(dialog.textContent).toContain("结果：约 9 Token");
    expect(dialog.textContent).toContain("Token 为本地估算，并非账单数据");
    expect(dialog.textContent).toContain("整理后内容更长，因为加入了格式化");
    expect(dialog.querySelectorAll("pre")).toHaveLength(2);
    expect(dialog.querySelectorAll("em")).toHaveLength(0);
    expect(dialog.querySelectorAll("pre")[1]?.textContent).toBe("# Heading\n<em>not HTML</em>");
  });

  it("cancels on Cancel or Escape without requesting replacement", () => {
    const { container, onCancel, onReplace } = renderPanel();
    const dialog = container.querySelector<HTMLElement>("[role='dialog']")!;

    fireEvent.click(container.querySelector("button[data-action='cancel']")!);
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("enables a safe result immediately", () => {
    const { container } = renderPanel();

    expect(container.querySelector<HTMLButtonElement>("button[data-action='replace']")?.disabled).toBe(false);
  });

  it("requires acknowledgement for a warning before replacement", () => {
    const { container, onReplace } = renderPanel({
      result: result({
        warnings: [{
          code: "critical_content_missing",
          severity: "warning",
          message: "Check protected content."
        }]
      })
    });
    const replace = container.querySelector<HTMLButtonElement>("button[data-action='replace']")!;

    expect(replace.disabled).toBe(true);
    fireEvent.click(container.querySelector<HTMLInputElement>("input[type='checkbox']")!);
    expect(replace.disabled).toBe(false);
    fireEvent.click(replace);
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it("keeps replacement disabled for an error result", () => {
    const { container } = renderPanel({
      result: result({
        safeToReplace: false,
        warnings: [{
          code: "critical_content_missing",
          severity: "error",
          message: "Critical content changed."
        }]
      })
    });

    expect(container.querySelector<HTMLButtonElement>("button[data-action='replace']")?.disabled).toBe(true);
  });

  it("traps Tab focus between dialog controls", () => {
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const appRoot = document.createElement("div");
    shadowRoot.append(appRoot);
    document.body.append(shadowHost);
    render(
      <PreviewPanel
        original="Original prompt"
        result={result()}
        mode="compact"
        onCancel={vi.fn()}
        onModeChange={vi.fn()}
        onReplace={vi.fn()}
      />,
      { container: appRoot }
    );
    const dialog = shadowRoot.querySelector<HTMLElement>("[role='dialog']")!;
    const controls = dialog.querySelectorAll<HTMLElement>("input, button:not([disabled])");
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;

    last.focus();
    expect(document.activeElement).toBe(shadowHost);
    expect(shadowRoot.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(shadowRoot.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(shadowRoot.activeElement).toBe(last);
  });
});
