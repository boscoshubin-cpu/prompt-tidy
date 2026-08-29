import { describe, expect, it, vi } from "vitest";

import { withPersistentContext } from "./persistent-context";

interface TestContext {
  close(): Promise<void>;
}

describe("withPersistentContext", () => {
  it("removes the profile when executable discovery fails", async () => {
    const discoveryError = new Error("invalid executable");
    const removeUserDataDir = vi.fn().mockResolvedValue(undefined);
    const launch = vi.fn<() => Promise<TestContext>>();

    await expect(withPersistentContext({
      createUserDataDir: vi.fn().mockResolvedValue("/tmp/test-profile"),
      discoverExecutable: () => { throw discoveryError; },
      launch,
      removeUserDataDir
    }, vi.fn())).rejects.toBe(discoveryError);

    expect(launch).not.toHaveBeenCalled();
    expect(removeUserDataDir).toHaveBeenCalledExactlyOnceWith("/tmp/test-profile");
  });

  it("removes the profile when browser launch fails", async () => {
    const launchError = new Error("launch failed");
    const removeUserDataDir = vi.fn().mockResolvedValue(undefined);

    await expect(withPersistentContext<TestContext>({
      createUserDataDir: vi.fn().mockResolvedValue("/tmp/test-profile"),
      discoverExecutable: vi.fn().mockReturnValue(undefined),
      launch: vi.fn().mockRejectedValue(launchError),
      removeUserDataDir
    }, vi.fn())).rejects.toBe(launchError);

    expect(removeUserDataDir).toHaveBeenCalledExactlyOnceWith("/tmp/test-profile");
  });

  it("removes the profile even when browser close fails", async () => {
    const closeError = new Error("close failed");
    const close = vi.fn().mockRejectedValue(closeError);
    const removeUserDataDir = vi.fn().mockResolvedValue(undefined);

    await expect(withPersistentContext<TestContext>({
      createUserDataDir: vi.fn().mockResolvedValue("/tmp/test-profile"),
      discoverExecutable: vi.fn().mockReturnValue("/tmp/chrome-for-testing"),
      launch: vi.fn().mockResolvedValue({ close }),
      removeUserDataDir
    }, vi.fn().mockResolvedValue(undefined))).rejects.toBe(closeError);

    expect(close).toHaveBeenCalledOnce();
    expect(removeUserDataDir).toHaveBeenCalledExactlyOnceWith("/tmp/test-profile");
  });
});
