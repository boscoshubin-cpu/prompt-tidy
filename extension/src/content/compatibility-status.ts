export interface CompatibilityStatus {
  state: "supported" | "unsupported" | "unknown";
  adapterVersion: "1";
  checkedAt: string;
  errorCategory?: "composer_not_found" | "mount_not_found" | "replacement_failed";
}

interface CompatibilityStorage {
  set(items: { compatibilityStatus: CompatibilityStatus }): Promise<void>;
}

export interface CompatibilityReporter {
  report(
    state: CompatibilityStatus["state"],
    errorCategory?: CompatibilityStatus["errorCategory"]
  ): Promise<void>;
}

export interface CompatibilityReporterOptions {
  storage: CompatibilityStorage;
  now(): string;
}

export function createCompatibilityReporter({
  storage,
  now
}: CompatibilityReporterOptions): CompatibilityReporter {
  let lastSavedState: string | undefined;
  let lastQueuedState: string | undefined;
  let lastQueuedReport: Promise<void> | undefined;
  let writeQueue = Promise.resolve();

  return {
    report(state, errorCategory) {
      const stateKey = `${state}:${errorCategory ?? ""}`;
      if (lastQueuedState === stateKey && lastQueuedReport) return lastQueuedReport;
      if (lastQueuedState === undefined && lastSavedState === stateKey) return Promise.resolve();

      const compatibilityStatus: CompatibilityStatus = {
        state,
        adapterVersion: "1",
        checkedAt: now(),
        ...(errorCategory ? { errorCategory } : {})
      };
      const write = writeQueue
        .catch(() => undefined)
        .then(() => storage.set({ compatibilityStatus }))
        .then(() => { lastSavedState = stateKey; });
      writeQueue = write;
      lastQueuedState = stateKey;
      lastQueuedReport = write;
      const clearQueuedReport = (): void => {
        if (lastQueuedReport === write) {
          lastQueuedState = undefined;
          lastQueuedReport = undefined;
        }
      };
      void write.then(clearQueuedReport, clearQueuedReport);
      return write;
    }
  };
}
