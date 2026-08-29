import { describe, expect, it, vi } from "vitest";

import { createCompatibilityReporter } from "./compatibility-status";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

describe("compatibility status reporter", () => {
  it("retries the same bounded status after storage rejects it", async () => {
    const set = vi.fn()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(undefined);
    const timestamps = [
      "2026-08-29T01:00:00.000Z",
      "2026-08-29T01:00:01.000Z"
    ];
    const reporter = createCompatibilityReporter({
      storage: { set },
      now: () => timestamps.shift()!
    });

    await expect(reporter.report("unsupported", "composer_not_found")).rejects.toThrow(
      "storage unavailable"
    );
    await reporter.report("unsupported", "composer_not_found");

    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenNthCalledWith(1, {
      compatibilityStatus: {
        state: "unsupported",
        adapterVersion: "1",
        checkedAt: "2026-08-29T01:00:00.000Z",
        errorCategory: "composer_not_found"
      }
    });
    expect(set).toHaveBeenNthCalledWith(2, {
      compatibilityStatus: {
        state: "unsupported",
        adapterVersion: "1",
        checkedAt: "2026-08-29T01:00:01.000Z",
        errorCategory: "composer_not_found"
      }
    });
  });

  it("deduplicates a saved state and refreshes checkedAt on a genuine transition", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const timestamps = [
      "2026-08-29T01:00:00.000Z",
      "2026-08-29T01:00:05.000Z"
    ];
    const reporter = createCompatibilityReporter({
      storage: { set },
      now: () => timestamps.shift()!
    });

    await reporter.report("supported");
    await reporter.report("supported");
    await reporter.report("unsupported", "composer_not_found");

    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[0]?.[0].compatibilityStatus.checkedAt).toBe("2026-08-29T01:00:00.000Z");
    expect(set.mock.calls[1]?.[0].compatibilityStatus.checkedAt).toBe("2026-08-29T01:00:05.000Z");
  });

  it("coalesces duplicate reports while the first storage write is pending", async () => {
    const pendingWrite = deferred<void>();
    const set = vi.fn(() => pendingWrite.promise);
    const reporter = createCompatibilityReporter({
      storage: { set },
      now: () => "2026-08-29T01:00:00.000Z"
    });

    const first = reporter.report("supported");
    const duplicate = reporter.report("supported");
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));

    pendingWrite.resolve();
    await Promise.all([first, duplicate]);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("preserves genuine transition order while earlier writes are pending", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const timestamps = [
      "2026-08-29T01:00:00.000Z",
      "2026-08-29T01:00:01.000Z",
      "2026-08-29T01:00:02.000Z"
    ];
    const reporter = createCompatibilityReporter({
      storage: { set },
      now: () => timestamps.shift()!
    });

    const first = reporter.report("supported");
    const second = reporter.report("unsupported", "composer_not_found");
    const third = reporter.report("supported");
    await Promise.all([first, second, third]);

    expect(set.mock.calls.map(([items]) => items.compatibilityStatus)).toEqual([
      {
        state: "supported",
        adapterVersion: "1",
        checkedAt: "2026-08-29T01:00:00.000Z"
      },
      {
        state: "unsupported",
        adapterVersion: "1",
        checkedAt: "2026-08-29T01:00:01.000Z",
        errorCategory: "composer_not_found"
      },
      {
        state: "supported",
        adapterVersion: "1",
        checkedAt: "2026-08-29T01:00:02.000Z"
      }
    ]);
  });
});
