import type { TransformMode, TransformResult } from "@prompt-tidy/transformer";
import { useEffect, useRef, useState } from "preact/hooks";

export interface PreviewPanelProps {
  original: string;
  result: TransformResult;
  mode: TransformMode;
  errorMessage?: string;
  operationErrorMessage?: string;
  onCancel(): void;
  onModeChange(mode: TransformMode): void;
  onReplace(): void | Promise<void>;
  onRetryOperation?(): void | Promise<void>;
}

function hasWarningAcknowledgement(result: TransformResult): boolean {
  return result.warnings.some((warning) => warning.severity === "warning");
}

function hasReplacementError(result: TransformResult, errorMessage?: string): boolean {
  return !result.safeToReplace
    || result.warnings.some((warning) => warning.severity === "error")
    || errorMessage !== undefined;
}

function focusableControls(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    "input:not([disabled]), button:not([disabled])"
  ));
}

function activeElementFor(dialog: HTMLElement): Element | null {
  const root = dialog.getRootNode();
  return root instanceof ShadowRoot ? root.activeElement : document.activeElement;
}

function characterChange(before: number, after: number): string {
  const delta = after - before;
  const percentage = before === 0 ? 0 : (delta / before) * 100;
  const deltaLabel = delta > 0 ? `+${delta}` : String(delta);
  const percentageLabel = percentage > 0 ? `+${percentage.toFixed(1)}` : percentage.toFixed(1);
  return `变化：${deltaLabel} 字符（${percentageLabel}%）`;
}

export function PreviewPanel({
  original,
  result,
  mode,
  errorMessage,
  operationErrorMessage,
  onCancel,
  onModeChange,
  onReplace,
  onRetryOperation
}: PreviewPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAcknowledgement = hasWarningAcknowledgement(result);
  const replacementDisabled = hasReplacementError(result, errorMessage)
    || (needsAcknowledgement && !acknowledged);

  useEffect(() => {
    setAcknowledged(false);
  }, [result]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) focusableControls(dialog)[0]?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const controls = focusableControls(dialog);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;

    const activeElement = activeElementFor(dialog);
    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      class="prompt-tidy-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-tidy-preview-title"
      onKeyDown={handleKeyDown}
    >
      <h2 id="prompt-tidy-preview-title">整理预览</h2>

      <fieldset>
        <legend>整理方式</legend>
        <label>
          <input
            type="radio"
            name="prompt-tidy-mode"
            value="compact"
            checked={mode === "compact"}
            onChange={() => onModeChange("compact")}
          />
          Compact
        </label>
        <label>
          <input
            type="radio"
            name="prompt-tidy-mode"
            value="structured"
            checked={mode === "structured"}
            onChange={() => onModeChange("structured")}
          />
          Structured
        </label>
      </fieldset>

      <section aria-label="原始输入">
        <h3>原始输入</h3>
        <pre>{original}</pre>
      </section>
      <section aria-label="整理结果">
        <h3>整理结果</h3>
        <pre>{result.output}</pre>
      </section>

      <p class="prompt-tidy-metrics">
        原始：{result.metrics.charactersBefore} 字符<br />
        结果：{result.metrics.charactersAfter} 字符<br />
        {characterChange(result.metrics.charactersBefore, result.metrics.charactersAfter)}<br />
        原始：约 {result.metrics.estimatedTokensBefore} Token<br />
        结果：约 {result.metrics.estimatedTokensAfter} Token
      </p>
      <p class="prompt-tidy-disclaimer">Token 为本地估算，并非账单数据</p>

      {result.warnings.some((warning) => warning.code === "result_longer") && (
        <p class="prompt-tidy-notice">整理后内容更长，因为加入了格式化</p>
      )}
      {result.warnings.length > 0 && (
        <ul aria-label="整理提示">
          {result.warnings.map((warning) => <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>)}
        </ul>
      )}
      {needsAcknowledgement && (
        <label>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          />
          我已核对关键内容
        </label>
      )}
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {operationErrorMessage && (
        <div class="prompt-tidy-operation-error">
          <p role="alert">{operationErrorMessage}</p>
          <button type="button" data-action="retry" onClick={() => { void onRetryOperation?.(); }}>重试</button>
        </div>
      )}

      <div class="prompt-tidy-preview-actions">
        <button type="button" data-action="cancel" onClick={onCancel}>取消</button>
        <button
          type="button"
          data-action="replace"
          disabled={replacementDisabled}
          onClick={() => { void onReplace(); }}
        >
          替换到输入框
        </button>
      </div>
    </div>
  );
}
