import { describe, expect, it } from "vitest";
import { transform } from "./index";

describe("transform", () => {
  it("returns deterministic unchanged output for a safe baseline", () => {
    const first = transform("Summarize this report.", { mode: "compact", locale: "en" });
    const second = transform("Summarize this report.", { mode: "compact", locale: "en" });
    expect(first).toEqual(second);
    expect(first.output).toBe("Summarize this report.");
    expect(first.warnings).toEqual([]);
    expect(first.metrics.charactersBefore).toBe(22);
  });
});
