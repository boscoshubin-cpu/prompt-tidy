import { render } from "preact";

import type { ComposerAdapter } from "../chatgpt/adapter";
import type { ModeStore } from "../settings/mode-store";
import { App } from "../ui/app";
import { promptTidyStyles } from "../ui/styles";

const mountedApps = new WeakMap<HTMLElement, HTMLElement>();

export interface MountPromptTidyOptions {
  adapter: ComposerAdapter;
  composer: HTMLElement;
  modeStore: ModeStore;
}

function removePromptTidyRoot(host: HTMLElement): void {
  const appRoot = mountedApps.get(host)
    ?? host.shadowRoot?.querySelector<HTMLElement>("[data-prompt-tidy-app='true']");
  if (appRoot) render(null, appRoot);
  mountedApps.delete(host);
  host.remove();
}

export function mountPromptTidy({ adapter, composer, modeStore }: MountPromptTidyOptions): boolean {
  const mountPoint = adapter.findMountPoint(composer);
  if (!mountPoint) return false;

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

  render(<App adapter={adapter} composer={composer} modeStore={modeStore} />, appRoot);
  return true;
}
