import {
  transform,
  type TransformMode,
  type TransformOptions,
  type TransformResult
} from "@prompt-tidy/transformer";
import { useEffect, useRef, useState } from "preact/hooks";

import type { ComposerAdapter } from "../chatgpt/adapter";
import type { ModeStore } from "../settings/mode-store";
import { PreviewPanel } from "./preview-panel";

export interface AppProps {
  adapter: ComposerAdapter;
  composer: HTMLElement;
  modeStore: ModeStore;
  onComputed?: (result: TransformResult) => void;
  onReplacementFailure?: () => void;
  onReplacementSuccess?: () => void;
  transformDraft?: (input: string, options: TransformOptions) => TransformResult;
}

interface PreviewState {
  original: string;
  result: TransformResult;
  mode: TransformMode;
}

type RetryOperation =
  | { kind: "tidy" }
  | { kind: "change_mode"; mode: TransformMode }
  | { kind: "save_mode"; mode: TransformMode; generation: number };

interface OperationErrorState {
  message: string;
  retry: RetryOperation;
}

function hasDraft(adapter: ComposerAdapter, composer: HTMLElement): boolean {
  return adapter.readDraft(composer).trim().length > 0;
}

export function App({
  adapter,
  composer,
  modeStore,
  onComputed,
  onReplacementFailure,
  onReplacementSuccess,
  transformDraft = transform
}: AppProps) {
  const [canTidy, setCanTidy] = useState(() => hasDraft(adapter, composer));
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [replacementError, setReplacementError] = useState<string>();
  const [operationError, setOperationError] = useState<OperationErrorState | null>(null);
  const tidyButtonRef = useRef<HTMLButtonElement>(null);
  const tidyRequestGeneration = useRef(0);
  const modeWrite = useRef<Promise<void>>(Promise.resolve());
  const modeSelectionGeneration = useRef(0);

  useEffect(() => {
    const updateAvailability = (): void => setCanTidy(hasDraft(adapter, composer));
    composer.addEventListener("input", updateAvailability);
    return () => composer.removeEventListener("input", updateAvailability);
  }, [adapter, composer]);

  const tidy = async (): Promise<void> => {
    const requestGeneration = tidyRequestGeneration.current + 1;
    tidyRequestGeneration.current = requestGeneration;
    setOperationError(null);

    try {
      const draft = adapter.readDraft(composer);
      if (draft.trim() === "") return;

      const mode = await modeStore.get();
      if (requestGeneration !== tidyRequestGeneration.current) return;

      const result = transformDraft(draft, { mode });
      onComputed?.(result);
      setReplacementError(undefined);
      setPreview({ original: draft, result, mode });
    } catch {
      if (requestGeneration === tidyRequestGeneration.current) {
        setOperationError({ message: "整理失败，请重试", retry: { kind: "tidy" } });
      }
    }
  };

  const closePreview = (focusTrigger = true): void => {
    modeSelectionGeneration.current += 1;
    setPreview(null);
    setReplacementError(undefined);
    setOperationError(null);
    if (focusTrigger) tidyButtonRef.current?.focus();
  };

  const persistMode = async (mode: TransformMode, generation: number): Promise<void> => {
    const nextWrite = modeWrite.current
      .catch(() => undefined)
      .then(() => modeStore.set(mode));
    modeWrite.current = nextWrite;

    try {
      await nextWrite;
      if (generation === modeSelectionGeneration.current) setOperationError(null);
    } catch {
      if (generation === modeSelectionGeneration.current) {
        setOperationError({
          message: "模式偏好保存失败，请重试",
          retry: { kind: "save_mode", mode, generation }
        });
      }
    }
  };

  const changeMode = async (mode: TransformMode): Promise<void> => {
    if (!preview || mode === preview.mode) return;

    const generation = modeSelectionGeneration.current + 1;
    modeSelectionGeneration.current = generation;
    setOperationError(null);

    let result: TransformResult;
    try {
      result = transformDraft(preview.original, { mode });
    } catch {
      setOperationError({ message: "整理失败，请重试", retry: { kind: "change_mode", mode } });
      return;
    }

    onComputed?.(result);
    setReplacementError(undefined);
    setPreview({ original: preview.original, result, mode });
    await persistMode(mode, generation);
  };

  const retryOperation = async (): Promise<void> => {
    const retry = operationError?.retry;
    if (!retry) return;
    setOperationError(null);

    if (retry.kind === "tidy") {
      await tidy();
    } else if (retry.kind === "change_mode") {
      await changeMode(retry.mode);
    } else {
      await persistMode(retry.mode, retry.generation);
    }
  };

  const recoverOriginalDraft = (original: string): string => {
    try {
      if (adapter.readDraft(composer) !== original) {
        adapter.replaceDraft(composer, original);
      }

      return adapter.readDraft(composer) === original
        ? "替换失败，原内容已保留"
        : "替换失败，请复制上方原文手动恢复";
    } catch {
      return "替换失败，请复制上方原文手动恢复";
    }
  };

  const replacePreview = (): void => {
    if (!preview) return;

    if (adapter.readDraft(composer) !== preview.original) {
      setReplacementError("输入内容已变化，请重新整理");
      return;
    }

    try {
      adapter.replaceDraft(composer, preview.result.output);
      composer.focus();
    } catch {
      onReplacementFailure?.();
      setReplacementError(recoverOriginalDraft(preview.original));
      return;
    }

    onReplacementSuccess?.();
    closePreview(false);
  };

  return (
    <>
      <button ref={tidyButtonRef} type="button" disabled={!canTidy} onClick={() => { void tidy(); }}>整理</button>
      {operationError && !preview && (
        <div class="prompt-tidy-operation-error">
          <p role="alert">{operationError.message}</p>
          <button type="button" data-action="retry" onClick={() => { void retryOperation(); }}>重试</button>
        </div>
      )}
      {preview && (
        <PreviewPanel
          key={preview.mode}
          original={preview.original}
          result={preview.result}
          mode={preview.mode}
          errorMessage={replacementError}
          operationErrorMessage={operationError?.message}
          onCancel={closePreview}
          onModeChange={(mode) => { void changeMode(mode); }}
          onReplace={replacePreview}
          onRetryOperation={retryOperation}
        />
      )}
    </>
  );
}
