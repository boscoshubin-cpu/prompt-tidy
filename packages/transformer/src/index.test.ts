import { describe, expect, it } from "vitest";
import { transform } from "./index";

describe("transform", () => {
  it("returns deterministic unchanged output for a safe baseline", () => {
    const first = transform("Summarize this report.", { mode: "compact", locale: "en" });
    const second = transform("Summarize this report.", { mode: "compact", locale: "en" });
    expect(first).toEqual(second);
    expect(first.output).toBe("Summarize this report.");
    expect(first.warnings).toContainEqual(expect.objectContaining({
      code: "nothing_to_tidy",
      severity: "info"
    }));
    expect(first.metrics.charactersBefore).toBe(22);
  });

  it("leaves code and links alone when they are the only content", () => {
    const input = "```\nnpm test\n```\nhttps://example.com";
    const result = transform(input, { mode: "compact", locale: "en" });

    expect(result.output).toBe(input);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "only_protected_content",
      severity: "info"
    }));
    expect(result.safeToReplace).toBe(true);
  });

  it("leaves original whitespace around code and links alone", () => {
    const input = "  `npm test`\n\nhttps://example.com  ";
    const result = transform(input, { mode: "compact", locale: "en" });

    expect(result.output).toBe(input);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "only_protected_content",
      severity: "info"
    }));
  });

  it("labels whitespace-only input as nothing to tidy", () => {
    const input = "  \n\t  ";
    const result = transform(input, { mode: "compact", locale: "en" });

    expect(result.output).toBe(input);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "nothing_to_tidy",
      severity: "info"
    }));
    expect(result.warnings).not.toContainEqual(expect.objectContaining({
      code: "only_protected_content"
    }));
  });

  it("does not mistake literal placeholder-looking content for a protected span", () => {
    const input = "prompt-tidy-looks-like-a-token";
    const result = transform(input, { mode: "compact", locale: "en" });

    expect(result.output).toBe(input);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "nothing_to_tidy",
      severity: "info"
    }));
    expect(result.warnings).not.toContainEqual(expect.objectContaining({
      code: "only_protected_content"
    }));
  });
});
