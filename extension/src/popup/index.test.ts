import { cleanup, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredCompatibilityStatus = {
  state: "supported" | "unsupported";
  adapterVersion: "1";
  checkedAt: string;
  promptDraft?: string;
  transformedDraft?: string;
};

const renderStoredStatus = async (compatibilityStatus: StoredCompatibilityStatus) => {
  const get = vi.fn().mockResolvedValue({ compatibilityStatus });

  vi.stubGlobal("chrome", {
    storage: {
      local: { get }
    }
  });

  await import("./index");

  await screen.findByRole("status");
  return { get };
};

describe("popup compatibility status", () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("renders the supported ChatGPT composer state", async () => {
    const { get } = await renderStoredStatus({
      state: "supported",
      adapterVersion: "1",
      checkedAt: "2026-08-29T00:00:00.000Z",
      promptDraft: "private draft must not appear"
    });

    expect(screen.getByRole("status").textContent).toContain("ChatGPT 输入框已识别");
    expect(document.body.textContent).not.toContain("private draft must not appear");
    expect(get).toHaveBeenCalledWith("compatibilityStatus");
  });

  it("renders the unsupported ChatGPT composer state", async () => {
    await renderStoredStatus({
      state: "unsupported",
      adapterVersion: "1",
      checkedAt: "2026-08-29T00:00:00.000Z",
      transformedDraft: "private transformed draft must not appear"
    });

    expect(screen.getByRole("status").textContent).toContain("当前页面未找到输入框");
    expect(document.body.textContent).not.toContain("private transformed draft must not appear");
  });
});
