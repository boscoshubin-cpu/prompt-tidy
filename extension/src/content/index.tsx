import { chatGptAdapter } from "../chatgpt/adapter";
import { startComposerObserver } from "../chatgpt/observer";
import { createModeStore } from "../settings/mode-store";
import { createCompatibilityReporter, type CompatibilityStatus } from "./compatibility-status";
import { mountPromptTidy } from "./mount";

const modeStore = createModeStore();
const compatibilityReporter = createCompatibilityReporter({
  storage: chrome.storage.local,
  now: () => new Date().toISOString()
});

function reportCompatibility(
  state: CompatibilityStatus["state"],
  errorCategory?: CompatibilityStatus["errorCategory"]
): void {
  void compatibilityReporter.report(state, errorCategory).catch(() => undefined);
}

const initialComposer = chatGptAdapter.findComposer();
reportCompatibility(
  initialComposer ? "unknown" : "unsupported",
  initialComposer ? undefined : "composer_not_found"
);

startComposerObserver({
  adapter: chatGptAdapter,
  onComposerMissing: () => reportCompatibility("unsupported", "composer_not_found"),
  onComposer: (composer) => {
    const mounted = mountPromptTidy({
      adapter: chatGptAdapter,
      composer,
      modeStore,
      onReplacementFailure: () => reportCompatibility("unsupported", "replacement_failed")
    });
    reportCompatibility(mounted ? "supported" : "unsupported", mounted ? undefined : "mount_not_found");
    return mounted;
  }
});
