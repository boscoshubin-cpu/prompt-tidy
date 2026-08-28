import type { TransformMode } from "@prompt-tidy/transformer";

export interface ModeStore {
  get(): Promise<TransformMode>;
  set(mode: TransformMode): Promise<void>;
}

interface LocalStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: { mode: TransformMode }): Promise<void>;
}

function isTransformMode(value: unknown): value is TransformMode {
  return value === "compact" || value === "structured";
}

function getLocalStorage(): LocalStorageArea {
  return chrome.storage.local as unknown as LocalStorageArea;
}

export function createModeStore(): ModeStore {
  return {
    async get(): Promise<TransformMode> {
      const saved = await getLocalStorage().get("mode");
      return isTransformMode(saved.mode) ? saved.mode : "compact";
    },

    async set(mode: TransformMode): Promise<void> {
      if (!isTransformMode(mode)) {
        throw new TypeError("Unsupported mode");
      }

      await getLocalStorage().set({ mode });
    }
  };
}
