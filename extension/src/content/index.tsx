import { render } from "preact";

import { chatGptAdapter } from "../chatgpt/adapter";
import { startComposerObserver } from "../chatgpt/observer";
import { createModeStore } from "../settings/mode-store";
import { App } from "../ui/app";
import { promptTidyStyles } from "../ui/styles";

const modeStore = createModeStore();

function mountPromptTidy(composer: HTMLElement): void {
  const mountPoint = chatGptAdapter.findMountPoint(composer);
  if (!mountPoint) return;

  for (const root of Array.from(mountPoint.children)) {
    if (root instanceof HTMLElement && root.dataset.promptTidyRoot === "true") {
      root.remove();
    }
  }

  const host = document.createElement("div");
  host.dataset.promptTidyRoot = "true";
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = promptTidyStyles;
  const appRoot = document.createElement("div");
  shadowRoot.append(style, appRoot);
  mountPoint.append(host);

  render(<App adapter={chatGptAdapter} composer={composer} modeStore={modeStore} />, appRoot);
}

startComposerObserver({ adapter: chatGptAdapter, onComposer: mountPromptTidy });
