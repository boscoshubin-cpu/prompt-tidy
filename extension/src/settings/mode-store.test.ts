import { afterEach, describe, expect, it, vi } from "vitest";

import { createModeStore } from "./mode-store";

type StorageLocal = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

function installStorage(initial: unknown = {}): StorageLocal {
  const storage: StorageLocal = {
    get: vi.fn().mockResolvedValue(initial),
    set: vi.fn().mockResolvedValue(undefined)
  };
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { storage: { local: storage } }
  });
  return storage;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "chrome");
});

describe("ModeStore", () => {
  it("defaults to compact and accepts only saved modes", async () => {
    const storage = installStorage({ mode: "unexpected" });
    const store = createModeStore();

    await expect(store.get()).resolves.toBe("compact");
    await store.set("structured");

    expect(storage.set).toHaveBeenCalledWith({ mode: "structured" });
    expect(storage.set).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown mode values without persisting them", async () => {
    const storage = installStorage();
    const store = createModeStore();

    await expect(store.set("draft" as never)).rejects.toThrow("Unsupported mode");
    expect(storage.set).not.toHaveBeenCalled();
  });
});
