import { chatGptAdapter } from "../chatgpt/adapter";
import { startComposerObserver } from "../chatgpt/observer";
import { createModeStore } from "../settings/mode-store";
import { mountPromptTidy } from "./mount";

const modeStore = createModeStore();

startComposerObserver({
  adapter: chatGptAdapter,
  onComposer: (composer) => mountPromptTidy({ adapter: chatGptAdapter, composer, modeStore })
});
