import { transform, type TransformResult } from "@prompt-tidy/transformer";
import { useEffect, useState } from "preact/hooks";

import type { ComposerAdapter } from "../chatgpt/adapter";
import type { ModeStore } from "../settings/mode-store";

export interface AppProps {
  adapter: ComposerAdapter;
  composer: HTMLElement;
  modeStore: ModeStore;
  onComputed?: (result: TransformResult) => void;
}

function hasDraft(adapter: ComposerAdapter, composer: HTMLElement): boolean {
  return adapter.readDraft(composer).trim().length > 0;
}

export function App({ adapter, composer, modeStore, onComputed }: AppProps) {
  const [canTidy, setCanTidy] = useState(() => hasDraft(adapter, composer));

  useEffect(() => {
    const updateAvailability = (): void => setCanTidy(hasDraft(adapter, composer));
    composer.addEventListener("input", updateAvailability);
    return () => composer.removeEventListener("input", updateAvailability);
  }, [adapter, composer]);

  const tidy = async (): Promise<void> => {
    const draft = adapter.readDraft(composer);
    if (draft.trim() === "") return;

    const mode = await modeStore.get();
    onComputed?.(transform(draft, { mode }));
  };

  return <button type="button" disabled={!canTidy} onClick={tidy}>整理</button>;
}
