import { render } from "preact";

import type { ComposerAdapter } from "../chatgpt/adapter";
import type { ModeStore } from "../settings/mode-store";
import { App } from "../ui/app";
import { promptTidyStyles } from "../ui/styles";

const mountedApps = new WeakMap<HTMLElement, HTMLElement>();
let activeMount: { composer: HTMLElement; host: HTMLElement } | undefined;

export interface MountPromptTidyOptions {
  adapter: ComposerAdapter;
  composer: HTMLElement;
  modeStore: ModeStore;
  onReplacementFailure?: () => void;
  onReplacementSuccess?: () => void;
}

function removePromptTidyRoot(host: HTMLElement): void {
  const appRoot = mountedApps.get(host)
    ?? host.shadowRoot?.querySelector<HTMLElement>("[data-prompt-tidy-app='true']");
  if (appRoot) render(null, appRoot);
  mountedApps.delete(host);
  if (activeMount?.host === host) activeMount = undefined;
  host.remove();
}

export function mountPromptTidy({
  adapter,
  composer,
  modeStore,
  onReplacementFailure,
  onReplacementSuccess
}: MountPromptTidyOptions): HTMLElement | null {
  const mountPoint = adapter.findMountPoint(composer);
  if (!mountPoint) return null;

  if (activeMount) removePromptTidyRoot(activeMount.host);

  for (const root of Array.from(mountPoint.children)) {
    if (root instanceof HTMLElement && root.dataset.promptTidyRoot === "true") {
      removePromptTidyRoot(root);
    }
  }

  const host = document.createElement("div");
  host.dataset.promptTidyRoot = "true";
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = promptTidyStyles;
  const appRoot = document.createElement("div");
  appRoot.dataset.promptTidyApp = "true";
  shadowRoot.append(style, appRoot);
  mountPoint.append(host);
  mountedApps.set(host, appRoot);

  render(
    <App
      adapter={adapter}
      composer={composer}
      modeStore={modeStore}
      onReplacementFailure={onReplacementFailure}
      onReplacementSuccess={onReplacementSuccess}
    />,
    appRoot
  );
  activeMount = { composer, host };
  return host;
}
