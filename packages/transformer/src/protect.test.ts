import { describe, expect, it } from "vitest";
import {
  UnresolvedProtectedSpanError,
  protectSpans,
  restoreSpans,
  type ProtectedCategory
} from "./protect";

describe("protected spans", () => {
  it.each<[ProtectedCategory, string]>([
    ["code_block", "Run ```\nnpm test\n``` now"],
    ["code_block", "Review\n~~~js\nconst total = 1;\n~~~\nnow"],
    ["inline_code", "Run `npm test` now"],
    ["url", "Open https://example.com/a?q=1"],
    ["email", "Reply to hi@example.com"],
    ["path", "Read /Users/yanxi/report.md"],
    ["path", "Review ./src/app.ts and ../config/settings.json"],
    ["path", "Read ~/notes/todo.md and \\\\server\\share\\report.md"],
    ["date", "Due 2026-08-28"],
    ["price", "Budget is ¥199.00"],
    ["number", "Return exactly 42 rows"],
    ["number", "Keep the grouped decimal 1,234.56"],
    ["quote", "保留“这段原文” and \"this quote\""],
    ["constraint", "不要删除数字，必须保留链接; only keep this; must not change it"]
  ])("round-trips %s spans", (_category, input) => {
    const protectedDoc = protectSpans(input);

    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
    expect(protectedDoc.spans.some((span) => span.category === _category)).toBe(true);
  });

  it("retains exact values and protects structured values before their numeric pieces", () => {
    const input = "https://example.com/a?q=1 2026-08-28 ¥199.00 42";
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.map((span) => [span.category, span.value])).toEqual([
      ["url", "https://example.com/a?q=1"],
      ["date", "2026-08-28"],
      ["price", "¥199.00"],
      ["number", "42"]
    ]);
    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
  });

  it("recognizes grouped decimals, grouped prices, and path forms as atomic spans", () => {
    const input = "Keep 1,234.56 and $1,234.56 in ./src/app.ts, ../config.json, ~/notes/todo.md, and \\\\server\\share\\report.md";
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.map(({ category, value }) => [category, value])).toEqual([
      ["number", "1,234.56"],
      ["price", "$1,234.56"],
      ["path", "./src/app.ts,"],
      ["path", "../config.json,"],
      ["path", "~/notes/todo.md,"],
      ["path", "\\\\server\\share\\report.md"]
    ]);
    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
  });

  it("protects Windows relative paths with nested segments as atomic spans", () => {
    const input = "Review .\\src\\components\\app.ts and ..\\config\\settings.json.";
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.filter(({ category }) => category === "path").map(({ value }) => value)).toEqual([
      ".\\src\\components\\app.ts",
      "..\\config\\settings.json."
    ]);
    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
  });

  it("protects dotted numeric identifiers with three components as one number", () => {
    const protectedDoc = protectSpans("Deploy version 1.2.3 now.");

    expect(protectedDoc.spans.filter(({ category }) => category === "number").map(({ value }) => value)).toEqual([
      "1.2.3"
    ]);
  });

  it("protects dotted numeric identifiers with four components as one number", () => {
    const protectedDoc = protectSpans("Deploy version 1.2.3.4 now.");

    expect(protectedDoc.spans.filter(({ category }) => category === "number").map(({ value }) => value)).toEqual([
      "1.2.3.4"
    ]);
  });

  it("protects Markdown backtick and tilde fences using compatible closing lengths", () => {
    const input = [
      "````markdown",
      "```nested```",
      "````",
      "",
      "~~~js",
      "  const total = 1,234.56;",
      "~~~~"
    ].join("\n");
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.filter(({ category }) => category === "code_block").map(({ value }) => value)).toEqual([
      ["````markdown", "```nested```", "````"].join("\n"),
      ["~~~js", "  const total = 1,234.56;", "~~~~"].join("\n")
    ]);
    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
  });

  it.each([
    ["double", "Review ``const x =  1`` exactly.", "``const x =  1``"],
    ["four", "Review ````const x = ```value```  +  1```` exactly.", "````const x = ```value```  +  1````"]
  ])("protects a valid %s-backtick code span as one exact value", (_label, input, expected) => {
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.filter(({ category }) => category === "inline_code").map(({ value }) => value)).toEqual([
      expected
    ]);
    expect(protectedDoc.issues).toEqual([]);
    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
  });

  it("marks an unclosed multi-backtick code span as ambiguous", () => {
    const protectedDoc = protectSpans("Review ``const x =  1` exactly.");

    expect(protectedDoc.issues).toContainEqual({
      category: "inline_code",
      reason: "ambiguous_syntax"
    });
  });

  it("protects a Markdown-indented code block byte-for-byte", () => {
    const block = ["    const x =  1;", "", "    return x;"].join("\n");
    const input = `Review this code:\n${block}\nThen summarize it.`;
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.filter(({ category }) => category === "code_block").map(({ value }) => value)).toContain(block);
    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
  });

  it("marks an unclosed Markdown fence as ambiguous instead of treating its body as prose", () => {
    const protectedDoc = protectSpans("Review this:\n~~~js\nconst total = 1,234.56;");

    expect(protectedDoc.issues).toContainEqual(expect.objectContaining({ category: "code_block" }));
  });

  it("keeps terminal punctuation in URL and path span values", () => {
    const input = "Open https://example.com/a?q=1. Read /Users/yanxi/report.md!";
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.map(({ category, value }) => [category, value])).toEqual([
      ["url", "https://example.com/a?q=1."],
      ["path", "/Users/yanxi/report.md!"]
    ]);
    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
  });

  it("fails restoration when an adversarial rewrite drops a Chinese constraint token", () => {
    const input = "不要删除数字，必须保留链接。";
    const protectedDoc = protectSpans(input);
    const constraint = protectedDoc.spans.find(({ category }) => category === "constraint")!;
    const rewritten = protectedDoc.text.replace(constraint.token, "改写内容");

    expect(protectedDoc.spans.filter(({ category }) => category === "constraint").map(({ value }) => value)).toEqual([
      "不要删除数字",
      "必须保留链接"
    ]);
    expect(() => restoreSpans(rewritten, protectedDoc.spans)).toThrow(UnresolvedProtectedSpanError);
  });

  it("fails restoration when an adversarial rewrite drops an English constraint token", () => {
    const input = "Only keep links; must not change numbers.";
    const protectedDoc = protectSpans(input);
    const constraint = protectedDoc.spans.find(({ value }) => /must not/iu.test(value))!;
    const rewritten = protectedDoc.text.replace(constraint.token, "rewritten");

    expect(protectedDoc.spans.filter(({ category }) => category === "constraint").map(({ value }) => value)).toEqual([
      "Only keep links",
      "must not change numbers"
    ]);
    expect(() => restoreSpans(rewritten, protectedDoc.spans)).toThrow(UnresolvedProtectedSpanError);
  });

  it.each([
    ["Do not delete invoices.", "Do not delete invoices"],
    ["DON'T delete invoices.", "DON'T delete invoices"],
    ["Never delete invoices.", "Never delete invoices"],
    ["Do not make it unclear, but keep it concise.", "Do not make it unclear"],
    ["It should not delete invoices.", "should not delete invoices"],
    ["Cannot delete invoices.", "Cannot delete invoices"],
    ["Without deleting invoices, summarize them.", "Without deleting invoices"],
    ["不得删除附件。", "不得删除附件"],
    ["禁止删除附件。", "禁止删除附件"]
  ])("protects the complete negated clause %s", (input, expected) => {
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.filter(({ category }) => category === "constraint").map(({ value }) => value)).toEqual([
      expected
    ]);
  });

  it("round-trips literal private-use placeholder-looking input", () => {
    const input = "Keep prompt-tidy-looks-like-a-token and `code` unchanged.";
    const protectedDoc = protectSpans(input);

    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
    expect(protectedDoc.text).toContain("prompt-tidy-looks-like-a-token");
  });

  it("uses a distinct nonce for each protected document", () => {
    const first = protectSpans("`one`");
    const second = protectSpans("`two`");

    expect(first.spans[0]?.token).toBeDefined();
    expect(second.spans[0]?.token).toBeDefined();
    expect(first.spans[0]?.token).not.toBe(second.spans[0]?.token);
  });

  it("throws a typed error when a protected token is missing", () => {
    const protectedDoc = protectSpans("Keep `npm test`.");
    const transformed = protectedDoc.text.replace(protectedDoc.spans[0]?.token ?? "", "");

    expect(() => restoreSpans(transformed, protectedDoc.spans)).toThrow(
      UnresolvedProtectedSpanError
    );
    expect(() => restoreSpans(transformed, protectedDoc.spans)).toThrow(/protected span/iu);
  });

  it("does not restore unrelated placeholder-looking text", () => {
    const protectedDoc = protectSpans("Keep `npm test`.");
    const unrelated = "prompt-tidy-other-document-0";

    expect(restoreSpans(`${unrelated} ${protectedDoc.text}`, protectedDoc.spans)).toBe(
      `${unrelated} Keep \`npm test\`.`
    );
  });
});
