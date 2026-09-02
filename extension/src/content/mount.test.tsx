import { act, fireEvent } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatGptAdapter, type ComposerAdapter } from "../chatgpt/adapter";
import { startComposerObserver } from "../chatgpt/observer";
import type { ModeStore } from "../settings/mode-store";
import { mountPromptTidy } from "./mount";

describe("mountPromptTidy", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
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

    expect(mountPromptTidy({ adapter, composer, modeStore })).not.toBeNull();
    await vi.waitFor(() => {
      readDraft.mockClear();
      fireEvent.input(composer);
      expect(readDraft).toHaveBeenCalledTimes(1);
    });
    expect(mountPoint.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);

    expect(mountPromptTidy({ adapter, composer, modeStore })).not.toBeNull();
    readDraft.mockClear();
    await vi.waitFor(() => {
      fireEvent.input(composer);
      expect(readDraft).toHaveBeenCalledTimes(1);
    });

    expect(mountPoint.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);
    expect(readDraft).toHaveBeenCalledTimes(1);
  });

  it("forwards a bounded replacement-failure event from the mounted App", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    const mountPoint = document.createElement("div");
    document.body.append(composer, mountPoint);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      findMountPoint: vi.fn(() => mountPoint),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(() => { throw new Error("synthetic replacement failure"); })
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const onReplacementFailure = vi.fn();
    const options = { adapter, composer, modeStore, onReplacementFailure };

    expect(mountPromptTidy(options)).not.toBeNull();
    const shadowRoot = mountPoint.querySelector<HTMLElement>("[data-prompt-tidy-root='true']")!.shadowRoot!;
    fireEvent.click(shadowRoot.querySelector<HTMLButtonElement>("button")!);
    await vi.waitFor(() => expect(shadowRoot.querySelector("[role='dialog']")).toBeTruthy());
    fireEvent.click(shadowRoot.querySelector<HTMLButtonElement>("button[data-action='replace']")!);

    await vi.waitFor(() => expect(onReplacementFailure).toHaveBeenCalledTimes(1));
    expect(onReplacementFailure).toHaveBeenCalledWith();
  });

  it("remounts into a replacement footer without replacing the composer", async () => {
    vi.useFakeTimers();
    const form = document.createElement("form");
    form.dataset.type = "composer";
    form.innerHTML = [
      '<div contenteditable="true" role="textbox">Draft</div>',
      '<div data-testid="composer-footer"><button type="submit">Send</button></div>'
    ].join("");
    document.body.append(form);
    const composer = form.querySelector<HTMLElement>("[role='textbox']")!;
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const stop = startComposerObserver({
      adapter: chatGptAdapter,
      debounceMs: 25,
      onComposer: (foundComposer) => mountPromptTidy({
        adapter: chatGptAdapter,
        composer: foundComposer,
        modeStore
      })
    });
    await vi.advanceTimersByTimeAsync(25);

    const replacementFooter = document.createElement("div");
    replacementFooter.dataset.testid = "composer-footer";
    replacementFooter.innerHTML = '<button type="submit">Send</button>';
    form.querySelector("[data-testid='composer-footer']")!.replaceWith(replacementFooter);
    await vi.advanceTimersByTimeAsync(25);

    expect(chatGptAdapter.findComposer()).toBe(composer);
    expect(document.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);
    expect(replacementFooter.querySelector("[data-prompt-tidy-root='true']")).not.toBeNull();
    stop();
  });

  it("unmounts the first App and its input listener when a second connected composer becomes active", async () => {
    const firstForm = document.createElement("form");
    firstForm.dataset.type = "composer";
    firstForm.innerHTML = [
      '<div contenteditable="true" role="textbox">First draft</div>',
      '<div data-testid="composer-footer"><button type="submit">Send</button></div>'
    ].join("");
    const secondForm = document.createElement("form");
    secondForm.dataset.type = "composer";
    secondForm.innerHTML = [
      '<div contenteditable="true" role="textbox">Second draft</div>',
      '<div data-testid="composer-footer"><button type="submit">Send</button></div>'
    ].join("");
    document.body.append(firstForm, secondForm);
    const firstComposer = firstForm.querySelector<HTMLElement>("[role='textbox']")!;
    const secondComposer = secondForm.querySelector<HTMLElement>("[role='textbox']")!;
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const readDraft = vi.spyOn(chatGptAdapter, "readDraft");
    await act(() => {
      expect(mountPromptTidy({ adapter: chatGptAdapter, composer: firstComposer, modeStore })).not.toBeNull();
    });
    readDraft.mockClear();
    fireEvent.input(firstComposer);
    expect(readDraft).toHaveBeenCalledTimes(1);

    await act(() => {
      expect(mountPromptTidy({ adapter: chatGptAdapter, composer: secondComposer, modeStore })).not.toBeNull();
    });
    readDraft.mockClear();
    fireEvent.input(secondComposer);
    expect(readDraft).toHaveBeenCalledTimes(1);

    readDraft.mockClear();
    fireEvent.input(firstComposer);
    expect.soft(readDraft).not.toHaveBeenCalled();
    fireEvent.input(secondComposer);

    expect(readDraft).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);
    expect(firstForm.querySelector("[data-prompt-tidy-root='true']")).toBeNull();
    expect(secondForm.querySelector("[data-prompt-tidy-root='true']")).not.toBeNull();
  });
});
