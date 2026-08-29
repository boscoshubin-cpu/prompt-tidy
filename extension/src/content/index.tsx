import { chatGptAdapter } from "../chatgpt/adapter";
import { startComposerObserver } from "../chatgpt/observer";
import { createModeStore } from "../settings/mode-store";
import { mountPromptTidy } from "./mount";

interface CompatibilityStatus {
  state: "supported" | "unsupported" | "unknown";
  adapterVersion: "1";
  checkedAt: string;
  errorCategory?: "composer_not_found" | "mount_not_found" | "replacement_failed";
}

const modeStore = createModeStore();
let lastCompatibilityState: string | undefined;

function reportCompatibility(
  state: CompatibilityStatus["state"],
  errorCategory?: CompatibilityStatus["errorCategory"]
): void {
  const stateKey = `${state}:${errorCategory ?? ""}`;
  if (lastCompatibilityState === stateKey) return;
  lastCompatibilityState = stateKey;

  const compatibilityStatus: CompatibilityStatus = {
    state,
    adapterVersion: "1",
    checkedAt: new Date().toISOString(),
    ...(errorCategory ? { errorCategory } : {})
  };
  void chrome.storage.local.set({ compatibilityStatus }).catch(() => undefined);
}

const initialComposer = chatGptAdapter.findComposer();
reportCompatibility(
  initialComposer ? "unknown" : "unsupported",
  initialComposer ? undefined : "composer_not_found"
);

startComposerObserver({
  adapter: chatGptAdapter,
  onComposer: (composer) => {
    const mounted = mountPromptTidy({ adapter: chatGptAdapter, composer, modeStore });
    reportCompatibility(mounted ? "supported" : "unsupported", mounted ? undefined : "mount_not_found");
    return mounted;
  }
});
