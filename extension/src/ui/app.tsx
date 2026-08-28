import { transform, type TransformMode, type TransformResult } from "@prompt-tidy/transformer";
import { useEffect, useRef, useState } from "preact/hooks";

import { ReplacementError, type ComposerAdapter } from "../chatgpt/adapter";
import type { ModeStore } from "../settings/mode-store";
import { PreviewPanel } from "./preview-panel";

export interface AppProps {
  adapter: ComposerAdapter;
  composer: HTMLElement;
  modeStore: ModeStore;
  onComputed?: (result: TransformResult) => void;
}

interface PreviewState {
  original: string;
  result: TransformResult;
  mode: TransformMode;
}

function hasDraft(adapter: ComposerAdapter, composer: HTMLElement): boolean {
  return adapter.readDraft(composer).trim().length > 0;
}

export function App({ adapter, composer, modeStore, onComputed }: AppProps) {
  const [canTidy, setCanTidy] = useState(() => hasDraft(adapter, composer));
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [replacementError, setReplacementError] = useState<string>();
  const tidyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const updateAvailability = (): void => setCanTidy(hasDraft(adapter, composer));
    composer.addEventListener("input", updateAvailability);
    return () => composer.removeEventListener("input", updateAvailability);
  }, [adapter, composer]);

  const tidy = async (): Promise<void> => {
    const draft = adapter.readDraft(composer);
    if (draft.trim() === "") return;

    const mode = await modeStore.get();
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
    await modeStore.set(mode);
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
    } catch (error) {
      if (error instanceof ReplacementError) {
        setReplacementError("替换失败，原内容已保留");
        return;
      }
      setReplacementError("替换失败，原内容已保留");
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
