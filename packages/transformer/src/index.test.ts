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

  it("preserves Windows relative paths and dotted numeric identifiers during public transforms", () => {
    const result = transform("please review .\\src\\app.ts with version 1.2.3.", {
      mode: "compact",
      locale: "en"
    });

    expect(result.output).toBe("Review .\\src\\app.ts with version 1.2.3.");
    expect(result.safeToReplace).toBe(true);
  });

  it.each(["compact", "structured"] as const)(
    "fails closed in %s mode when an unquoted path contains repeated spaces",
    (mode) => {
      const input = "Could you please review /Users/me/My  File.txt.";
      const result = transform(input, { mode, locale: "en" });

      expect(result.output).toBe(input);
      expect(result.safeToReplace).toBe(false);
      expect(result.warnings).toContainEqual(expect.objectContaining({
        category: "path",
        severity: "error"
      }));
    }
  );

  it.each([
    ["Please review ``const x =  1`` exactly.", "Review ``const x =  1`` exactly."],
    [
      "Please review ````const x = ```value```  +  1```` exactly.",
      "Review ````const x = ```value```  +  1```` exactly."
    ]
  ])("preserves delimiter-run inline code through the public API", (input, expected) => {
    const result = transform(input, { mode: "compact", locale: "en" });

    expect(result.output).toBe(expected);
    expect(result.safeToReplace).toBe(true);
  });

  it("fails closed through the public API for an unclosed multi-backtick span", () => {
    const input = "Please review ``const x =  1` exactly.";
    const result = transform(input, { mode: "compact", locale: "en" });

    expect(result.output).toBe(input);
    expect(result.safeToReplace).toBe(false);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      category: "inline_code",
      severity: "error"
    }));
  });

  it.each(["compact", "structured"] as const)(
    "fails closed in %s mode for an unclosed line fence containing embedded triple backticks",
    (mode) => {
      const marker = "```";
      const input = [
        "Please review this code:",
        `${marker}js`,
        `const marker = "${marker}";`,
        "const x =  1;"
      ].join("\n");
      const result = transform(input, { mode, locale: "en" });

      expect(result.output).toBe(input);
      expect(result.safeToReplace).toBe(false);
      expect(result.warnings).toContainEqual(expect.objectContaining({
        category: "code_block",
        severity: "error"
      }));
    }
  );

  it.each(["compact", "structured"] as const)(
    "preserves the closed control line fence containing embedded triple backticks in %s mode",
    (mode) => {
      const marker = "```";
      const block = [
        `${marker}js`,
        `const marker = "${marker}";`,
        "const x =  1;",
        marker
      ].join("\n");
      const result = transform(`Task: Review this code.\n${block}`, { mode, locale: "en" });

      expect(result.output).toContain(block);
      expect(result.safeToReplace).toBe(true);
      expect(result.warnings).not.toContainEqual(expect.objectContaining({ severity: "error" }));
    }
  );

  it.each(["compact", "structured"] as const)(
    "preserves consecutive closed fences after embedded triple backticks in %s mode",
    (mode) => {
      const marker = "```";
      const tildeBlock = [
        "~~~js",
        `const marker = "${marker}";`,
        "~~~"
      ].join("\n");
      const backtickBlock = [
        `${marker}js`,
        "const x =  1;",
        marker
      ].join("\n");
      const result = transform(
        `Task: Review these blocks.\n${tildeBlock}\n${backtickBlock}`,
        { mode, locale: "en" }
      );

      expect(result.output).toContain(tildeBlock);
      expect(result.output).toContain(backtickBlock);
      expect(result.safeToReplace).toBe(true);
      expect(result.warnings).not.toContainEqual(expect.objectContaining({ severity: "error" }));
    }
  );

  it("preserves Markdown-indented code byte-for-byte through the public API", () => {
    const input = [
      "Review this code:",
      "    const x =  1;",
      "",
      "    return x;"
    ].join("\n");
    const result = transform(input, { mode: "compact", locale: "en" });

    expect(result.output).toBe(input);
    expect(result.safeToReplace).toBe(true);
  });

  it.each([
    ["请你", "zh", "compact"],
    ["请你", "zh", "structured"],
    ["basically,", "en", "compact"],
    ["basically,", "en", "structured"]
  ] as const)("keeps non-empty filler-only input %s unchanged for %s locale in %s mode", (input, locale, mode) => {
    const result = transform(input, { mode, locale });

    expect(result.output).toBe(input);
    expect(result.changes).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "nothing_to_tidy",
      severity: "info"
    }));
    expect(result.metrics.charactersAfter).toBe(input.length);
    expect(result.safeToReplace).toBe(true);
  });
});
