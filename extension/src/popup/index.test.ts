import { cleanup, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredCompatibilityStatus = {
  state: "supported" | "unsupported";
  adapterVersion: "1";
  checkedAt: string;
  promptDraft?: string;
  transformedDraft?: string;
  errorCategory?: "composer_not_found" | "mount_not_found" | "replacement_failed";
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
      errorCategory: "composer_not_found",
      transformedDraft: "private transformed draft must not appear"
    });

    expect(screen.getByRole("status").textContent).toContain("当前页面未找到 ChatGPT 输入框");
    expect(document.body.textContent).not.toContain("private transformed draft must not appear");
  });

  it.each([
    ["mount_not_found", "已找到输入框，但整理按钮无法挂载"],
    ["replacement_failed", "上次替换失败，请返回页面重试"]
  ] as const)("distinguishes %s from composer discovery failure", async (errorCategory, expected) => {
    await renderStoredStatus({
      state: "unsupported",
      adapterVersion: "1",
      checkedAt: "2026-08-29T00:00:00.000Z",
      errorCategory
    });

    expect(screen.getByRole("status").textContent).toContain(expected);
    expect(screen.getByRole("status").textContent).not.toContain("当前页面未找到 ChatGPT 输入框");
  });
});
