import { afterEach, describe, expect, it, vi } from "vitest";

import { chatGptAdapter } from "./adapter";
import { startComposerObserver } from "./observer";

function makeComposerFixture(): HTMLElement {
  const form = document.createElement("form");
  form.dataset.type = "composer";
  form.innerHTML = [
    '<div contenteditable="true" role="textbox">Draft</div>',
    '<div data-testid="composer-footer"><button type="submit">Send</button></div>'
  ].join("");
  return form;
}

function mountHost(composer: HTMLElement): HTMLElement {
  const mountPoint = chatGptAdapter.findMountPoint(composer)!;
  const host = document.createElement("div");
  host.dataset.promptTidyRoot = "true";
  mountPoint.append(host);
  return host;
}

describe("startComposerObserver", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("discovers the composer present when observation starts", async () => {
    vi.useFakeTimers();
    const composerFixture = makeComposerFixture();
    document.body.append(composerFixture);
    const onComposer = vi.fn(mountHost);

    const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledWith(composerFixture.querySelector('[role="textbox"]'));
    stop();
  });

  it("mounts once per connected composer", async () => {
    vi.useFakeTimers();
    const onComposer = vi.fn(mountHost);
    const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
    document.body.append(makeComposerFixture());

    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledTimes(1);
    stop();
  });

  it("rediscovers after the composer is replaced", async () => {
    vi.useFakeTimers();
    const first = makeComposerFixture();
    document.body.append(first);
    const onComposer = vi.fn(mountHost);
    const onComposerMissing = vi.fn();
    const options = { adapter: chatGptAdapter, onComposer, onComposerMissing, debounceMs: 25 };
    const stop = startComposerObserver(options);
    await vi.advanceTimersByTimeAsync(25);

    const replacement = makeComposerFixture();
    first.replaceWith(replacement);
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledTimes(2);
    expect(onComposer).toHaveBeenLastCalledWith(replacement.querySelector('[role="textbox"]'));
    expect(onComposerMissing).not.toHaveBeenCalled();
    stop();
  });

  it("reports a mounted composer missing only after a debounced discovery finds no replacement", async () => {
    vi.useFakeTimers();
    const first = makeComposerFixture();
    document.body.append(first);
    const onComposer = vi.fn(mountHost);
    const onComposerMissing = vi.fn();
    const options = { adapter: chatGptAdapter, onComposer, onComposerMissing, debounceMs: 25 };
    const stop = startComposerObserver(options);
    await vi.advanceTimersByTimeAsync(25);

    first.remove();
    await vi.advanceTimersByTimeAsync(24);
    expect(onComposerMissing).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onComposerMissing).toHaveBeenCalledTimes(1);

    document.body.append(document.createElement("div"));
    await vi.advanceTimersByTimeAsync(25);
    expect(onComposerMissing).toHaveBeenCalledTimes(1);
    stop();
  });

  it("retries the same composer when its first mount attempt cannot succeed", async () => {
    vi.useFakeTimers();
    const composerFixture = makeComposerFixture();
    const composer = composerFixture.querySelector<HTMLElement>('[role="textbox"]')!;
    let mountPointAvailable = false;
    let mountedRoots = 0;
    const onComposer = vi.fn(() => {
      if (!mountPointAvailable) return null;
      mountedRoots += 1;
      const host = document.createElement("div");
      chatGptAdapter.findMountPoint(composer)?.append(host);
      return host;
    });
    const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
    document.body.append(composerFixture);

    await vi.advanceTimersByTimeAsync(25);
    expect(onComposer).toHaveBeenCalledTimes(1);
    expect(mountedRoots).toBe(0);

    mountPointAvailable = true;
    composerFixture.append(document.createElement("div"));
    await vi.advanceTimersByTimeAsync(25);
    composerFixture.append(document.createElement("div"));
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledTimes(2);
    expect(onComposer).toHaveBeenLastCalledWith(composer);
    expect(mountedRoots).toBe(1);
    stop();
  });

  it("remounts when only the footer is replaced under the same composer", async () => {
    vi.useFakeTimers();
    const fixture = makeComposerFixture();
    document.body.append(fixture);
    const onComposer = vi.fn(mountHost);
    const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    const composer = fixture.querySelector<HTMLElement>("[role='textbox']")!;
    const originalHost = fixture.querySelector<HTMLElement>("[data-prompt-tidy-root='true']")!;
    const replacementFooter = document.createElement("div");
    replacementFooter.dataset.testid = "composer-footer";
    replacementFooter.innerHTML = '<button type="submit">Send</button>';
    fixture.querySelector("[data-testid='composer-footer']")!.replaceWith(replacementFooter);
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledTimes(2);
    expect(onComposer).toHaveBeenLastCalledWith(composer);
    expect(originalHost.isConnected).toBe(false);
    expect(replacementFooter.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);
    stop();
  });

  it("remounts when the tracked host stays connected but leaves the current mount point", async () => {
    vi.useFakeTimers();
    const fixture = makeComposerFixture();
    const parkingLot = document.createElement("aside");
    document.body.append(fixture, parkingLot);
    const onComposer = vi.fn(mountHost);
    const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    const originalHost = fixture.querySelector<HTMLElement>("[data-prompt-tidy-root='true']")!;
    parkingLot.append(originalHost);
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledTimes(2);
    expect(fixture.querySelectorAll("[data-prompt-tidy-root='true']")).toHaveLength(1);
    stop();
  });
});
