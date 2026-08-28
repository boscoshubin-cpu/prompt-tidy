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
    ["inline_code", "Run `npm test` now"],
    ["url", "Open https://example.com/a?q=1"],
    ["email", "Reply to hi@example.com"],
    ["path", "Read /Users/yanxi/report.md"],
    ["date", "Due 2026-08-28"],
    ["price", "Budget is ¥199.00"],
    ["number", "Return exactly 42 rows"],
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

  it("keeps terminal punctuation in URL and path span values", () => {
    const input = "Open https://example.com/a?q=1. Read /Users/yanxi/report.md!";
    const protectedDoc = protectSpans(input);

    expect(protectedDoc.spans.map(({ category, value }) => [category, value])).toEqual([
      ["url", "https://example.com/a?q=1."],
      ["path", "/Users/yanxi/report.md!"]
    ]);
    expect(restoreSpans(protectedDoc.text, protectedDoc.spans)).toBe(input);
  });

  it("protects complete Chinese constraint clauses through punctuation boundaries", () => {
    const input = "不要删除数字，必须保留链接。";
    const protectedDoc = protectSpans(input);
    const rewritten = protectedDoc.text.replace("不要删除数字", "改写内容").replace("必须保留链接", "改写内容");

    expect(protectedDoc.spans.filter(({ category }) => category === "constraint").map(({ value }) => value)).toEqual([
      "不要删除数字",
      "必须保留链接"
    ]);
    expect(restoreSpans(rewritten, protectedDoc.spans)).toBe(input);
  });

  it("protects complete English constraint clauses through punctuation boundaries", () => {
    const input = "Only keep links; must not change numbers.";
    const protectedDoc = protectSpans(input);
    const rewritten = protectedDoc.text.replace("Only keep links", "rewritten").replace("must not change numbers", "rewritten");

    expect(protectedDoc.spans.filter(({ category }) => category === "constraint").map(({ value }) => value)).toEqual([
      "Only keep links",
      "must not change numbers"
    ]);
    expect(restoreSpans(rewritten, protectedDoc.spans)).toBe(input);
  });

  it.each([
    ["Do not delete invoices.", "Do not delete invoices"],
    ["DON'T delete invoices.", "DON'T delete invoices"],
    ["Never delete invoices.", "Never delete invoices"],
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
