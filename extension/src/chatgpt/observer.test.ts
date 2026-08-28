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
    const onComposer = vi.fn();

    const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledWith(composerFixture.querySelector('[role="textbox"]'));
    stop();
  });

  it("mounts once per connected composer", async () => {
    vi.useFakeTimers();
    const onComposer = vi.fn();
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
    const onComposer = vi.fn();
    const stop = startComposerObserver({ adapter: chatGptAdapter, onComposer, debounceMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    const replacement = makeComposerFixture();
    first.replaceWith(replacement);
    await vi.advanceTimersByTimeAsync(25);

    expect(onComposer).toHaveBeenCalledTimes(2);
    expect(onComposer).toHaveBeenLastCalledWith(replacement.querySelector('[role="textbox"]'));
    stop();
  });
});
