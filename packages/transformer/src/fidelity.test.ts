import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateFidelity } from "./fidelity";
import { transform } from "./index";
import { protectSpans } from "./protect";

function criticalMultiset(input: string): string[] {
  return protectSpans(input).spans
    .map(({ category, value }) => `${category}\u0000${value}`)
    .sort();
}

describe("validateFidelity", () => {
  it.each([
    ["Keep 42 rows", "Keep rows", "number"],
    ["不要删除附件", "删除附件", "negation"],
    ["Open https://example.com", "Open the site", "url"],
    ["Run `npm test`", "Run tests", "inline_code"]
  ])("blocks replacement when %s loses critical content", (before, after, category) => {
    const protectedDoc = protectSpans(before);
    const warnings = validateFidelity(before, after, protectedDoc.spans);

    expect(warnings).toContainEqual(expect.objectContaining({
      code: "critical_content_missing",
      severity: "error",
      category
    }));
  });

  it("accepts reordered exact critical values", () => {
    const before = "Keep 42 rows, open https://example.com, then run `npm test`.";
    const after = "Run `npm test`, open https://example.com, then keep 42 rows.";
    const warnings = validateFidelity(before, after, protectSpans(before).spans);

    expect(warnings).toEqual([]);
  });

  it("treats duplicate critical values as a multiset", () => {
    const before = "Keep 42 rows and 42 columns.";
    const after = "Keep 42 rows.";
    const warnings = validateFidelity(before, after, protectSpans(before).spans);

    expect(warnings).toContainEqual(expect.objectContaining({ category: "number", severity: "error" }));
  });

  it("rejects added duplicate critical values", () => {
    const before = "Keep 42 rows.";
    const after = "Keep 42 and 42 rows.";
    const warnings = validateFidelity(before, after, protectSpans(before).spans);

    expect(warnings).toContainEqual(expect.objectContaining({ category: "number", severity: "error" }));
  });

  it("rejects a changed negated constraint even when the negation remains", () => {
    const before = "Must not delete invoices.";
    const after = "Must not delete records.";
    const warnings = validateFidelity(before, after, protectSpans(before).spans);

    expect(warnings).toContainEqual(expect.objectContaining({ category: "constraint", severity: "error" }));
  });

  it.each([
    ["Do not delete invoices.", "Do not delete records."],
    ["禁止删除附件。", "禁止删除记录。"]
  ])("rejects %s when its negation marker remains but the operand changes", (before, after) => {
    const warnings = validateFidelity(before, after, protectSpans(before).spans);

    expect(warnings).toContainEqual(expect.objectContaining({ category: "constraint", severity: "error" }));
  });

  it("keeps user values out of fidelity diagnostics", () => {
    const before = "Open https://example.com/private-token";
    const warnings = validateFidelity(before, "Open the site", protectSpans(before).spans);

    expect(warnings.every(({ message }) => !message.includes("private-token"))).toBe(true);
  });

  it.each([
    ["Keep 1,234.56 rows.", "Keep 1,234. 56 rows.", "number"],
    ["Review ./src/app.ts now.", "Review.src/app.ts now.", "path"],
    ["~~~js\n  const total = 1;\n~~~", "~~~js const total = 1; ~~~", "code_block"],
    ["It should not delete invoices.", "It should delete invoices.", "negation"]
  ])("rejects adversarial critical mutation of %s", (before, after, category) => {
    const warnings = validateFidelity(before, after, protectSpans(before).spans);

    expect(warnings).toContainEqual(expect.objectContaining({ category, severity: "error" }));
  });

  it("independently detects grouped-decimal corruption when parser spans are unavailable", () => {
    const parserBlindSpans = [
      { category: "number" as const, token: "unused-0", value: "1,234" },
      { category: "number" as const, token: "unused-1", value: "56" }
    ];
    const warnings = validateFidelity(
      "Keep 1,234.56 rows.",
      "Keep 1,234. 56 rows.",
      parserBlindSpans
    );

    expect(warnings).toContainEqual(expect.objectContaining({ category: "number", severity: "error" }));
  });

  it("independently detects dotted numeric identifier corruption when parser spans are unavailable", () => {
    const parserBlindSpans = [
      { category: "number" as const, token: "unused-0", value: "1.2" },
      { category: "number" as const, token: "unused-1", value: "3" }
    ];
    const warnings = validateFidelity(
      "Deploy version 1.2.3",
      "Deploy version 1.2. 3",
      parserBlindSpans
    );

    expect(warnings).toContainEqual(expect.objectContaining({ category: "number", severity: "error" }));
  });

  it("rejects a Windows-relative path when its required leading boundary is removed", () => {
    const before = "Review .\\src\\app.ts now.";
    const after = "Review.\\src\\app.ts now.";
    const warnings = validateFidelity(before, after, protectSpans(before).spans);

    expect(warnings).toContainEqual(expect.objectContaining({ category: "path", severity: "error" }));
  });
});

describe("fidelity invariant", () => {
  const safeSegment = fc.array(fc.constantFrom("a", "b", "c", "d", "e", "f"), {
    minLength: 1,
    maxLength: 8
  }).map((characters) => characters.join(""));

  it("preserves exact critical multisets, removes tokens, and is idempotent", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9_999 }), { minLength: 1, maxLength: 4 }),
        fc.array(safeSegment, { minLength: 1, maxLength: 3 }),
        fc.array(safeSegment, { minLength: 1, maxLength: 3 }),
        (numbers, urlPaths, clauseObjects) => {
          const urls = urlPaths.map((path) => `https://example.com/${path}`);
          const negations = clauseObjects.map((object) => `must not delete ${object}`);
          const input = [
            `Keep ${numbers.join(" and ")} rows.`,
            `Open ${urls.join(" and ")}.`,
            `${negations.join("; ")}.`
          ].join(" ");
          const options = { mode: "compact", locale: "en" } as const;
          const result = transform(input, options);

          expect(criticalMultiset(result.output)).toEqual(criticalMultiset(input));
          expect(result.output).not.toContain("\uE000prompt-tidy-");
          expect(transform(result.output, options).output).toBe(result.output);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("preserves generated grouped decimals, paths, and fences in both modes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 999_999_999 }),
        fc.integer({ min: 0, max: 99 }),
        safeSegment,
        fc.constantFrom("compact", "structured"),
        (whole, fraction, name, mode) => {
          const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
          const amount = `${groupedWhole}.${fraction.toString().padStart(2, "0")}`;
          const path = `./src/${name}.ts`;
          const fence = ["~~~ts", `  const total = ${amount};`, "~~~~"].join("\n");
          const input = mode === "structured"
            ? `Task: Review ${path}. Background: Use this code:\n${fence}`
            : `Review ${path} with ${amount} rows.\n${fence}`;
          const options = { mode, locale: "en" } as const;
          const result = transform(input, options);

          expect(result.output).toContain(path);
          expect(result.output).toContain(amount);
          expect(result.output).toContain(fence);
          expect(result.safeToReplace).toBe(true);
          expect(transform(result.output, options).output).toBe(result.output);
        }
      ),
      { numRuns: 100 }
    );
  });
});
