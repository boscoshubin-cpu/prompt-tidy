import { transform, type TransformMode, type TransformResult } from "@prompt-tidy/transformer";
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
}

interface PreviewState {
  original: string;
  result: TransformResult;
  mode: TransformMode;
}

function hasDraft(adapter: ComposerAdapter, composer: HTMLElement): boolean {
  return adapter.readDraft(composer).trim().length > 0;
}

export function App({
  adapter,
  composer,
  modeStore,
  onComputed,
  onReplacementFailure
}: AppProps) {
  const [canTidy, setCanTidy] = useState(() => hasDraft(adapter, composer));
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [replacementError, setReplacementError] = useState<string>();
  const tidyButtonRef = useRef<HTMLButtonElement>(null);
  const tidyRequestGeneration = useRef(0);
  const modeWrite = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const updateAvailability = (): void => setCanTidy(hasDraft(adapter, composer));
    composer.addEventListener("input", updateAvailability);
    return () => composer.removeEventListener("input", updateAvailability);
  }, [adapter, composer]);

  const tidy = async (): Promise<void> => {
    const requestGeneration = tidyRequestGeneration.current + 1;
    tidyRequestGeneration.current = requestGeneration;
    const draft = adapter.readDraft(composer);
    if (draft.trim() === "") return;

    const mode = await modeStore.get();
    if (requestGeneration !== tidyRequestGeneration.current) return;

    const result = transform(draft, { mode });
    onComputed?.(result);
    setReplacementError(undefined);
    setPreview({ original: draft, result, mode });
  };

  const closePreview = (focusTrigger = true): void => {
    setPreview(null);
    setReplacementError(undefined);
    if (focusTrigger) tidyButtonRef.current?.focus();
  };

  const changeMode = async (mode: TransformMode): Promise<void> => {
    if (!preview || mode === preview.mode) return;

    const result = transform(preview.original, { mode });
    onComputed?.(result);
    setReplacementError(undefined);
    setPreview({ original: preview.original, result, mode });
    const nextWrite = modeWrite.current
      .catch(() => undefined)
      .then(() => modeStore.set(mode));
    modeWrite.current = nextWrite;
    await nextWrite;
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
      closePreview(false);
    } catch {
      onReplacementFailure?.();
      setReplacementError(recoverOriginalDraft(preview.original));
    }
  };

  return (
    <>
      <button ref={tidyButtonRef} type="button" disabled={!canTidy} onClick={() => { void tidy(); }}>整理</button>
      {preview && (
        <PreviewPanel
          key={preview.mode}
          original={preview.original}
          result={preview.result}
          mode={preview.mode}
          errorMessage={replacementError}
          onCancel={closePreview}
          onModeChange={(mode) => { void changeMode(mode); }}
          onReplace={replacePreview}
        />
      )}
    </>
  );
}
