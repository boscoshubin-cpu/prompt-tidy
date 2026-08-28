import { fireEvent } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ComposerAdapter } from "../chatgpt/adapter";
import { startComposerObserver } from "../chatgpt/observer";
import type { ModeStore } from "../settings/mode-store";
import { mountPromptTidy } from "./mount";

describe("mountPromptTidy", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("mounts one root when a mount point appears after composer discovery", async () => {
    vi.useFakeTimers();
    const composer = document.createElement("div");
    let mountPoint: HTMLElement | null = null;
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(() => composer.isConnected ? composer : null),
      findMountPoint: vi.fn(() => mountPoint),
      readDraft: vi.fn(() => "Draft"),
      replaceDraft: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const stop = startComposerObserver({
      adapter,
      debounceMs: 25,
      onComposer: (foundComposer) => mountPromptTidy({ adapter, composer: foundComposer, modeStore })
    });
    document.body.append(composer);

    await vi.advanceTimersByTimeAsync(25);
    expect(document.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(0);

    mountPoint = document.createElement("div");
    document.body.append(mountPoint);
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(25);

    expect(mountPoint.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);
    stop();
  });

  it("unmounts a stale App before remounting one root", async () => {
    const composer = document.createElement("div");
    const mountPoint = document.createElement("div");
    document.body.append(composer, mountPoint);
    const readDraft = vi.fn(() => "Draft");
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      findMountPoint: vi.fn(() => mountPoint),
      readDraft,
      replaceDraft: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };

    expect(mountPromptTidy({ adapter, composer, modeStore })).toBe(true);
    await vi.waitFor(() => {
      readDraft.mockClear();
      fireEvent.input(composer);
      expect(readDraft).toHaveBeenCalledTimes(1);
    });
    expect(mountPoint.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);

    expect(mountPromptTidy({ adapter, composer, modeStore })).toBe(true);
    readDraft.mockClear();
    await vi.waitFor(() => {
      fireEvent.input(composer);
      expect(readDraft).toHaveBeenCalledTimes(1);
    });

    expect(mountPoint.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);
    expect(readDraft).toHaveBeenCalledTimes(1);
  });
});
