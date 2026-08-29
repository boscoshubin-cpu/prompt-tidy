import { afterEach, describe, expect, it, vi } from "vitest";

import { chatGptAdapter } from "./adapter";
import { startComposerObserver } from "./observer";

function makeComposerFixture(): HTMLElement {
  const form = document.createElement("form");
  form.dataset.type = "composer";
  form.innerHTML = '<div contenteditable="true" role="textbox">Draft</div>';
  return form;
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
    const onComposer = vi.fn(() => true);

    const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledWith(composerFixture.querySelector('[role="textbox"]'));
    stop();
  });

  it("mounts once per connected composer", async () => {
    vi.useFakeTimers();
    const onComposer = vi.fn(() => true);
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
    const onComposer = vi.fn(() => true);
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
    const onComposer = vi.fn(() => true);
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
      if (!mountPointAvailable) return false;
      mountedRoots += 1;
      return true;
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
});
