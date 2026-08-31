import { fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReplacementError, type ComposerAdapter } from "../chatgpt/adapter";
import type { ModeStore } from "../settings/mode-store";
import { transform } from "@prompt-tidy/transformer";
import { App } from "./app";

function panel(): HTMLElement {
  return document.querySelector<HTMLElement>("[role='dialog']")!;
}

function replaceButton(): HTMLButtonElement {
  return panel().querySelector<HTMLButtonElement>("button[data-action='replace']")!;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

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

  it("recomputes a mode switch from the unchanged original draft and stores only the mode", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = {
      get: vi.fn().mockResolvedValue("compact"),
      set: vi.fn().mockResolvedValue(undefined)
    };

    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);
    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());

    composer.value = "Newer typing must not be used.";
    fireEvent.click(panel().querySelector<HTMLInputElement>("input[value='structured']")!);

    await vi.waitFor(() => expect(modeStore.set).toHaveBeenCalledWith("structured"));
    expect(panel().querySelectorAll("pre")[0]?.textContent).toBe("Please write a clear answer.");
  });

  it("closes a cancelled preview without replacing the draft", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    fireEvent.click(panel().querySelector("button[data-action='cancel']")!);

    await vi.waitFor(() => expect(document.querySelector("[role='dialog']")).toBeNull());
    expect(adapter.replaceDraft).not.toHaveBeenCalled();
  });

  it("replaces only after confirmation, then closes and focuses the composer", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn((target, text) => { target.textContent = text; }),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const onReplacementSuccess = vi.fn();
    const { container } = render(
      <App
        adapter={adapter}
        composer={composer}
        modeStore={modeStore}
        onReplacementSuccess={onReplacementSuccess}
      />
    );

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    expect(adapter.replaceDraft).not.toHaveBeenCalled();
    fireEvent.click(replaceButton());

    await vi.waitFor(() => expect(adapter.replaceDraft).toHaveBeenCalledTimes(1));
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.activeElement).toBe(composer);
    expect(onReplacementSuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps the preview open and preserves the original when the draft changed", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    composer.value = "I typed something newer.";
    fireEvent.click(replaceButton());

    await vi.waitFor(() => expect(panel().textContent).toContain("输入内容已变化，请重新整理"));
    expect(adapter.replaceDraft).not.toHaveBeenCalled();
    expect(replaceButton().disabled).toBe(true);
  });

  it("leaves the preview open with a local error when replacement verification fails", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(() => { throw new ReplacementError(); }),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const onReplacementFailure = vi.fn();
    const { container } = render(
      <App
        adapter={adapter}
        composer={composer}
        modeStore={modeStore}
        onReplacementFailure={onReplacementFailure}
      />
    );

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    fireEvent.click(replaceButton());

    await vi.waitFor(() => expect(panel().textContent).toContain("替换失败，原内容已保留"));
    expect(replaceButton().disabled).toBe(true);
    expect(onReplacementFailure).toHaveBeenCalledTimes(1);
    expect(onReplacementFailure).toHaveBeenCalledWith();
  });

  it("verifies and rolls back a partially written ReplacementError before reporting that the original remains", async () => {
    const original = "Please write a clear answer.";
    const composer = document.createElement("textarea");
    composer.value = original;
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn((_target, text) => {
        if (text === original) {
          composer.value = original;
          return;
        }
        composer.value = "partially replaced";
        throw new ReplacementError();
      }),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    fireEvent.click(replaceButton());

    await vi.waitFor(() => expect(panel().textContent).toContain("替换失败，原内容已保留"));
    expect(composer.value).toBe(original);
    expect(adapter.replaceDraft).toHaveBeenLastCalledWith(composer, original);
  });

  it("shows manual recovery guidance when a failed replacement cannot be verified or rolled back", async () => {
    const original = "Please write a clear answer.";
    const composer = document.createElement("textarea");
    composer.value = original;
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn((_target, text) => {
        if (text !== original) composer.value = "partially replaced";
        throw new ReplacementError();
      }),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    fireEvent.click(replaceButton());

    await vi.waitFor(() => expect(panel().textContent).toContain("替换失败，请复制上方原文手动恢复"));
    expect(replaceButton().disabled).toBe(true);
    expect(composer.value).toBe("partially replaced");
  });

  it("serializes rapid mode saves so the final Compact selection wins", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    document.body.append(composer);
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    let storedMode: "compact" | "structured" = "compact";
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = {
      get: vi.fn().mockResolvedValue("compact"),
      set: vi.fn((mode) => {
        const write = mode === "structured" ? firstWrite : secondWrite;
        return write.promise.then(() => { storedMode = mode; });
      })
    };
    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    fireEvent.click(panel().querySelector<HTMLInputElement>("input[value='structured']")!);
    await vi.waitFor(() => expect(modeStore.set).toHaveBeenCalledTimes(1));
    fireEvent.click(panel().querySelector<HTMLInputElement>("input[value='compact']")!);
    expect(modeStore.set).toHaveBeenCalledTimes(1);

    firstWrite.resolve(undefined);
    await vi.waitFor(() => expect(modeStore.set).toHaveBeenCalledTimes(2));
    secondWrite.resolve(undefined);
    await vi.waitFor(() => expect(storedMode).toBe("compact"));
  });

  it("keeps the latest tidy request when async mode reads resolve out of order", async () => {
    const composer = document.createElement("textarea");
    composer.value = "First draft";
    document.body.append(composer);
    const firstRead = deferred<"compact" | "structured">();
    const secondRead = deferred<"compact" | "structured">();
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = {
      get: vi.fn().mockReturnValueOnce(firstRead.promise).mockReturnValueOnce(secondRead.promise),
      set: vi.fn()
    };
    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);

    fireEvent.click(container.querySelector("button")!);
    composer.value = "Second draft";
    fireEvent.click(container.querySelector("button")!);
    secondRead.resolve("structured");
    await vi.waitFor(() => expect(panel().querySelectorAll("pre")[0]?.textContent).toBe("Second draft"));

    firstRead.resolve("compact");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(panel().querySelectorAll("pre")[0]?.textContent).toBe("Second draft");
    expect(panel().querySelector<HTMLInputElement>("input[value='structured']")?.checked).toBe(true);
  });

  it("shows a local retry when reading the saved mode fails", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = {
      get: vi.fn().mockRejectedValueOnce(new Error("storage unavailable")).mockResolvedValueOnce("compact"),
      set: vi.fn()
    };
    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(container.querySelector("[role='alert']")?.textContent).toContain("整理失败，请重试"));
    expect(document.querySelector("[role='dialog']")).toBeNull();

    fireEvent.click(container.querySelector<HTMLButtonElement>("button[data-action='retry']")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    expect(modeStore.get).toHaveBeenCalledTimes(2);
  });

  it("shows a local retry when an unexpected transform fails", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Please write a clear answer.";
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = { get: vi.fn().mockResolvedValue("compact"), set: vi.fn() };
    const transformDraft = vi.fn()
      .mockImplementationOnce(() => { throw new Error("synthetic transform failure"); })
      .mockImplementation(transform);
    const { container } = render(
      <App
        adapter={adapter}
        composer={composer}
        modeStore={modeStore}
        transformDraft={transformDraft}
      />
    );

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(container.querySelector("[role='alert']")?.textContent).toContain("整理失败，请重试"));
    fireEvent.click(container.querySelector<HTMLButtonElement>("button[data-action='retry']")!);

    await vi.waitFor(() => expect(panel()).toBeTruthy());
    expect(transformDraft).toHaveBeenCalledTimes(2);
  });

  it("keeps the computed preview and retries a failed mode preference write", async () => {
    const composer = document.createElement("textarea");
    composer.value = "Task: Analyze this project. Audience: College students.";
    document.body.append(composer);
    const adapter: ComposerAdapter = {
      findComposer: vi.fn(),
      readDraft: vi.fn(() => composer.value),
      replaceDraft: vi.fn(),
      findMountPoint: vi.fn()
    };
    const modeStore: ModeStore = {
      get: vi.fn().mockResolvedValue("compact"),
      set: vi.fn().mockRejectedValueOnce(new Error("storage unavailable")).mockResolvedValueOnce(undefined)
    };
    const { container } = render(<App adapter={adapter} composer={composer} modeStore={modeStore} />);

    fireEvent.click(container.querySelector("button")!);
    await vi.waitFor(() => expect(panel()).toBeTruthy());
    fireEvent.click(panel().querySelector<HTMLInputElement>("input[value='structured']")!);

    await vi.waitFor(() => expect(container.querySelector("[role='alert']")?.textContent).toContain("模式偏好保存失败，请重试"));
    expect(panel().querySelector<HTMLInputElement>("input[value='structured']")?.checked).toBe(true);
    fireEvent.click(container.querySelector<HTMLButtonElement>("button[data-action='retry']")!);

    await vi.waitFor(() => expect(modeStore.set).toHaveBeenCalledTimes(2));
    expect(modeStore.set).toHaveBeenNthCalledWith(1, "structured");
    expect(modeStore.set).toHaveBeenNthCalledWith(2, "structured");
    await vi.waitFor(() => expect(container.querySelector("[role='alert']")).toBeNull());
  });
});
