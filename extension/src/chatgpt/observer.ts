import type { ComposerAdapter } from "./adapter";

export interface ComposerObserverOptions {
  adapter: ComposerAdapter;
  onComposer: (composer: HTMLElement) => HTMLElement | null;
  onComposerMissing?: () => void;
  debounceMs?: number;
}

export function startComposerObserver({
  adapter,
  onComposer,
  onComposerMissing,
  debounceMs = 50
}: ComposerObserverOptions): () => void {
  let mountedComposer: HTMLElement | null = null;
  let mountedHost: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const mountIsHealthy = (composer: HTMLElement): boolean => {
    const currentMountPoint = adapter.findMountPoint(composer);
    return mountedHost !== null
      && mountedHost.isConnected
      && currentMountPoint !== null
      && currentMountPoint.contains(mountedHost);
  };

  const discover = (): void => {
    timer = undefined;
    const mountedComposerDisconnected = mountedComposer !== null && !mountedComposer.isConnected;

    if (mountedComposerDisconnected) {
      mountedComposer = null;
      mountedHost = null;
    }

    const composer = adapter.findComposer();
    if (composer && composer.isConnected) {
      const composerChanged = composer !== mountedComposer;
      if (composerChanged || !mountIsHealthy(composer)) {
        const host = onComposer(composer);
        if (host?.isConnected) {
          mountedHost = host;
          mountedComposer = composer;
        } else {
          mountedHost = null;
          mountedComposer = null;
        }
      }
    } else if (!composer && mountedComposerDisconnected) {
      onComposerMissing?.();
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
