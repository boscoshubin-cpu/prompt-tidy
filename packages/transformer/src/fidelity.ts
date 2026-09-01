import {
  NEGATION_MARKER_SOURCE,
  protectSpans,
  type ProtectedCategory,
  type ProtectedSpan
} from "./protect";
import type { TransformWarning } from "./types";

type CriticalCategory = ProtectedCategory | "dotted_atom" | "negation";

const NEGATION_PATTERN = new RegExp(NEGATION_MARKER_SOURCE, "giu");

function negationMultiset(text: string): Map<string, number> {
  const values = new Map<string, number>();

  for (const match of text.matchAll(NEGATION_PATTERN)) {
    const value = match[0].toLocaleLowerCase();
    values.set(value, (values.get(value) ?? 0) + 1);
  }

  return values;
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
    addValue(values, span.category, span.value);
  }

  return values;
}

function countLiteral(text: string, value: string): number {
  if (value === "") return 0;

  let count = 0;
  let offset = 0;
  while (offset <= text.length - value.length) {
    const match = text.indexOf(value, offset);
    if (match < 0) break;
    count += 1;
    offset = match + value.length;
  }
  return count;
}

function missingExactLiteralCategories(
  output: string,
  spans: readonly ProtectedSpan[]
): CriticalCategory[] {
  const expected = protectedMultisets(spans);

  return [...expected.entries()].flatMap(([category, values]) => (
    [...values.entries()].some(([value, count]) => countLiteral(output, value) < count)
      ? [category]
      : []
  ));
}

// This deliberately does not share protect.ts's numeric lexer. It is a
// defense-in-depth signal so a future protection-parser regression cannot make
// both sides agree that a grouped decimal was safely split.
const FIDELITY_NUMBER_PATTERN = /(?<![\p{L}\p{N}_])(?:\d+(?:\.\d+){2,}|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_])/gu;

const FIDELITY_WINDOWS_RELATIVE_PATH_PATTERN = /(?:^|(?<=\s))\.{1,2}\\(?:[^\\\s<>"'“”‘’]+\\)*[^\\\s<>"'“”‘’]+/gu;

const FIDELITY_DOTTED_ATOM_PATTERN = /(?<![\p{L}\p{N}_])[\p{L}_][\p{L}\p{N}_-]*(?:\.[\p{L}_][\p{L}\p{N}_-]*)+(?![\p{L}\p{N}_])/gu;

function rawNumberMultiset(text: string): Map<string, number> {
  const values = new Map<string, number>();
  for (const match of text.matchAll(FIDELITY_NUMBER_PATTERN)) {
    const value = match[0];
    values.set(value, (values.get(value) ?? 0) + 1);
  }
  return values;
}

function rawWindowsRelativePathMultiset(text: string): Map<string, number> {
  const values = new Map<string, number>();
  for (const match of text.matchAll(FIDELITY_WINDOWS_RELATIVE_PATH_PATTERN)) {
    const value = match[0];
    values.set(value, (values.get(value) ?? 0) + 1);
  }
  return values;
}

function rawDottedAtomMultiset(text: string): Map<string, number> {
  const values = new Map<string, number>();
  for (const match of text.matchAll(FIDELITY_DOTTED_ATOM_PATTERN)) {
    const value = match[0];
    values.set(value, (values.get(value) ?? 0) + 1);
  }
  return values;
}

function differs(expected: ReadonlyMap<string, number>, actual: ReadonlyMap<string, number>): boolean {
  const values = new Set([...expected.keys(), ...actual.keys()]);

  return [...values].some((value) => expected.get(value) !== actual.get(value));
}

function changedCategories(
  original: string,
  output: string,
  spans: readonly ProtectedSpan[]
): CriticalCategory[] {
  const expected = protectedMultisets(spans);
  const outputDocument = protectSpans(output);
  const actual = protectedMultisets(outputDocument.spans);
  const protectedCategories = new Set([...expected.keys(), ...actual.keys()]);
  const changed = new Set<CriticalCategory>([...protectedCategories]
    .filter((category) => differs(expected.get(category) ?? new Map(), actual.get(category) ?? new Map())));

  for (const category of missingExactLiteralCategories(output, spans)) changed.add(category);
  for (const issue of protectSpans(original).issues) changed.add(issue.category);
  for (const issue of outputDocument.issues) changed.add(issue.category);

  if (differs(rawNumberMultiset(original), rawNumberMultiset(output))) {
    changed.add("number");
  }

  if (differs(rawWindowsRelativePathMultiset(original), rawWindowsRelativePathMultiset(output))) {
    changed.add("path");
  }

  if (differs(rawDottedAtomMultiset(original), rawDottedAtomMultiset(output))) {
    changed.add("dotted_atom");
  }

  if (differs(negationMultiset(original), negationMultiset(output))) {
    changed.add("negation");
  }

  return [...changed];
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
  return changedCategories(original, output, spans).map((category) => ({
    code: "critical_content_missing",
    severity: "error",
    category,
    message: `Critical ${category} content changed during transformation.`
  }));
}
