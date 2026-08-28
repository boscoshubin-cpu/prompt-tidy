import { fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ComposerAdapter } from "../chatgpt/adapter";
import type { ModeStore } from "../settings/mode-store";
import { App } from "./app";

describe("App", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("disables 整理 for an empty draft and computes without replacing or sending", async () => {
    const composer = document.createElement("div");
    const readDraft = vi.fn(() => "   ");
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft,
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = {
      get: vi.fn().mockResolvedValue("compact"),
      set: vi.fn()
    };
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const appRoot = document.createElement("div");
    shadowRoot.append(appRoot);
    document.body.append(shadowHost);
    const onComputed = vi.fn();
    const dispatchEvent = vi.spyOn(composer, "dispatchEvent");

    render(
      <App adapter={adapter} composer={composer} modeStore={modeStore} onComputed={onComputed} />,
      { container: appRoot }
    );
    const button = shadowRoot.querySelector<HTMLButtonElement>("button")!;

    expect(button.textContent).toBe("整理");
    expect(button.disabled).toBe(true);

    readDraft.mockReturnValue("  Please write clearly.  ");
    fireEvent.input(composer);
    expect(button.disabled).toBe(false);
    readDraft.mockClear();
    dispatchEvent.mockClear();

    fireEvent.click(button);
    await vi.waitFor(() => expect(onComputed).toHaveBeenCalledTimes(1));

    expect(readDraft).toHaveBeenCalledTimes(1);
    expect(adapter.replaceDraft).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
