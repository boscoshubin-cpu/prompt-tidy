import { protectSpans, type ProtectedCategory, type ProtectedSpan } from "./protect";
import type { TransformWarning } from "./types";

type CriticalCategory = ProtectedCategory | "negation";

const NEGATION_PATTERN = /不要|不得|禁止|must\s+not|do\s+not|don't|never/giu;
const NEGATION_TEST_PATTERN = /不要|不得|禁止|must\s+not|do\s+not|don't|never/iu;

function negationMultiset(text: string): Map<string, number> {
  const values = new Map<string, number>();

  for (const match of text.matchAll(NEGATION_PATTERN)) {
    const value = match[0].toLocaleLowerCase();
    values.set(value, (values.get(value) ?? 0) + 1);
  }

  return values;
}

function containsNegation(value: string): boolean {
  return NEGATION_TEST_PATTERN.test(value);
}

function addValue(
  values: Map<CriticalCategory, Map<string, number>>,
  category: CriticalCategory,
  value: string
): void {
  const categoryValues = values.get(category) ?? new Map<string, number>();
  categoryValues.set(value, (categoryValues.get(value) ?? 0) + 1);
  values.set(category, categoryValues);
}

function protectedMultisets(spans: readonly ProtectedSpan[]): Map<CriticalCategory, Map<string, number>> {
  const values = new Map<CriticalCategory, Map<string, number>>();

  for (const span of spans) {
    // Negations are compared as their own semantic category below, rather
    // than requiring the entire surrounding constraint clause verbatim.
    if (span.category === "constraint" && containsNegation(span.value)) continue;
    addValue(values, span.category, span.value);
  }

  return values;
}

function isMissing(expected: ReadonlyMap<string, number>, actual: ReadonlyMap<string, number>): boolean {
  return [...expected].some(([value, count]) => (actual.get(value) ?? 0) < count);
}

function missingCategories(
  original: string,
  output: string,
  spans: readonly ProtectedSpan[]
): CriticalCategory[] {
  const expected = protectedMultisets(spans);
  const actual = protectedMultisets(protectSpans(output).spans);
  const missing = [...expected]
    .filter(([category, values]) => isMissing(values, actual.get(category) ?? new Map()))
    .map(([category]) => category);

  if (isMissing(negationMultiset(original), negationMultiset(output))) {
    missing.push("negation");
  }

  return missing;
}

/**
 * Checks that critical literal values and negations survive a completed
 * rewrite. Warnings deliberately identify only categories, never user values.
 */
export function validateFidelity(
  original: string,
  output: string,
  spans: readonly ProtectedSpan[]
): TransformWarning[] {
  return missingCategories(original, output, spans).map((category) => ({
    code: "critical_content_missing",
    severity: "error",
    category,
    message: `Critical ${category} content is missing from the transformed prompt.`
  }));
}
