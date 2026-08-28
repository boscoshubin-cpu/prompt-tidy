import { describe, expect, it, vi } from "vitest";

vi.mock("./protect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./protect")>();

  return {
    ...actual,
    restoreSpans: () => {
      const span = actual.protectSpans("`fallback`").spans[0];
      if (!span) throw new Error("Fallback test requires a protected span.");
      throw new actual.UnresolvedProtectedSpanError(span);
    }
  };
});

import { transform } from "./index";

describe("transform unresolved protected span fallback", () => {
  it("retains the original prompt, reports an error, and blocks replacement", () => {
    const input = "Keep `npm test`";
    const result = transform(input, { mode: "compact", locale: "en" });

    expect(result.output).toBe(input);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "critical_content_missing",
      severity: "error",
      category: "protected_span"
    }));
    expect(result.metrics).toEqual({
      charactersBefore: 15,
      charactersAfter: 15,
      estimatedTokensBefore: 5,
      estimatedTokensAfter: 5
    });
    expect(result.safeToReplace).toBe(false);
  });
});
