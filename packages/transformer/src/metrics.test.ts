import { describe, expect, it } from "vitest";
import { buildMetrics, estimateTokens } from "./metrics";

describe("estimateTokens", () => {
  it.each([
    ["", 0],
    ["分析项目", 4],
    ["summarize the project", 3],
    ["hello, world!", 4],
    ["分析 report!", 4]
  ])("estimates %j deterministically", (text, expected) => {
    expect(estimateTokens(text)).toBe(expected);
    expect(estimateTokens(text)).toBe(expected);
  });
});

describe("buildMetrics", () => {
  it("labels length increases without claiming savings", () => {
    const metrics = buildMetrics("分析项目", "## 任务\n分析项目");

    expect(metrics.charactersAfter).toBeGreaterThan(metrics.charactersBefore);
    expect(metrics.estimatedTokensBefore).toBeGreaterThan(0);
    expect(metrics.estimatedTokensAfter).toBeGreaterThan(0);
  });

  it("returns zero metrics for empty text", () => {
    expect(buildMetrics("", "")).toEqual({
      charactersBefore: 0,
      charactersAfter: 0,
      estimatedTokensBefore: 0,
      estimatedTokensAfter: 0
    });
  });
});
