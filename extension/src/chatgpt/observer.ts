import type { ComposerAdapter } from "./adapter";

export interface ComposerObserverOptions {
  adapter: ComposerAdapter;
  onComposer: (composer: HTMLElement) => boolean;
  debounceMs?: number;
}

export function startComposerObserver({
  adapter,
  onComposer,
  debounceMs = 50
}: ComposerObserverOptions): () => void {
  let mountedComposer: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const discover = (): void => {
    timer = undefined;

    if (mountedComposer && !mountedComposer.isConnected) {
      mountedComposer = null;
    }

    const composer = adapter.findComposer();
    if (composer && composer.isConnected && composer !== mountedComposer) {
      if (onComposer(composer)) {
        mountedComposer = composer;
      }
    }
  };

  const scheduleDiscovery = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(discover, debounceMs);
  };

  const observer = new MutationObserver(scheduleDiscovery);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleDiscovery();

  return () => {
    observer.disconnect();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}
