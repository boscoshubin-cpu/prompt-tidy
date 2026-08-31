import type { TransformOptions, TransformResult } from "./types";
import { compactText } from "./compact";
import { validateFidelity } from "./fidelity";
import { buildMetrics } from "./metrics";
import { normalizeText } from "./normalize";
import {
  protectSpans,
  restoreSpans,
  UnresolvedProtectedSpanError,
  NEGATION_MARKER_SOURCE,
  type ProtectedSpan,
  type ProtectedDocument
} from "./protect";
import { structureText } from "./structured";

export type {
  ChangeKind,
  ChangeSummary,
  Locale,
  TransformMetrics,
  TransformMode,
  TransformOptions,
  TransformResult,
  TransformWarning,
  WarningCode
} from "./types";

export { validateFidelity } from "./fidelity";

function validateInput(input: string): void {
  if (typeof input !== "string") {
    throw new TypeError("Prompt input must be a string.");
  }
}

function resolveLocale(input: string, locale: TransformOptions["locale"]): "zh" | "en" | "auto" {
  if (locale && locale !== "auto") return locale;
  return /\p{Script=Han}/u.test(input) ? "auto" : "en";
}

function addExplicitConstraintMarkers(
  text: string,
  spans: readonly ProtectedSpan[],
  locale: "zh" | "en" | "auto"
): string {
  let marked = text;

  for (const span of spans) {
    if (span.category !== "constraint") continue;

    const tokenIndex = marked.indexOf(span.token);
    if (tokenIndex < 0) continue;
    const beforeToken = marked.slice(0, tokenIndex);
    const clauseStart = Math.max(
      beforeToken.lastIndexOf("\n"),
      beforeToken.lastIndexOf("。"),
      beforeToken.lastIndexOf("！"),
      beforeToken.lastIndexOf("？"),
      beforeToken.lastIndexOf("."),
      beforeToken.lastIndexOf("!"),
      beforeToken.lastIndexOf("?")
    ) + 1;

    if (beforeToken.slice(clauseStart).trim() !== "") continue;

    const isConstraint = new RegExp(`^(?:${NEGATION_MARKER_SOURCE}|\\bonly\\b)`, "iu").test(span.value);
    const marker = locale === "en"
      ? isConstraint ? "Constraints: " : "Requirements: "
      : isConstraint ? "约束：" : "要求：";
    marked = `${marked.slice(0, tokenIndex)}${marker}${marked.slice(tokenIndex)}`;
  }

  return marked;
}

function hasOnlyProtectedContent(protectedDocument: ProtectedDocument): boolean {
  if (protectedDocument.spans.length === 0) return false;

  return protectedDocument.spans.reduce(
    (text, span) => text.split(span.token).join(""),
    protectedDocument.text
  ).trim() === "";
}

function safeToReplace(warnings: readonly TransformResult["warnings"][number][]): boolean {
  return warnings.every((warning) => warning.severity !== "error");
}

function contentWarnings(input: string, output: string): TransformResult["warnings"] {
  if (output === input) {
    return [{
      code: "nothing_to_tidy",
      severity: "info",
      message: "Nothing to tidy; the prompt was already concise."
    }];
  }

  return [];
}

function unresolvedSpanResult(input: string): TransformResult {
  const warnings: TransformResult["warnings"] = [{
    code: "critical_content_missing",
    severity: "error",
    category: "protected_span",
    message: "A protected content category could not be restored."
  }];

  return {
    output: input,
    changes: [],
    warnings,
    metrics: buildMetrics(input, input),
    safeToReplace: safeToReplace(warnings)
  };
}

function unchangedContentResult(
  input: string,
  warning: TransformResult["warnings"][number]
): TransformResult {
  const warnings = [warning];

  return {
    output: input,
    changes: [],
    warnings,
    metrics: buildMetrics(input, input),
    safeToReplace: safeToReplace(warnings)
  };
}

function ambiguousContentResult(
  input: string,
  categories: readonly string[]
): TransformResult {
  const warnings: TransformResult["warnings"] = [...new Set(categories)].map((category) => ({
    code: "critical_content_missing",
    severity: "error",
    category,
    message: `Ambiguous ${category} syntax was left unchanged for safety.`
  }));

  return {
    output: input,
    changes: [],
    warnings,
    metrics: buildMetrics(input, input),
    safeToReplace: false
  };
}

export function transform(input: string, options: TransformOptions): TransformResult {
  validateInput(input);

  if (input.trim() === "") {
    return unchangedContentResult(input, {
      code: "nothing_to_tidy",
      severity: "info",
      message: "Nothing to tidy; the prompt was already concise."
    });
  }

  try {
    const locale = resolveLocale(input, options.locale);
    const protectedDoc = protectSpans(input);
    if (protectedDoc.issues.length > 0) {
      return ambiguousContentResult(input, protectedDoc.issues.map(({ category }) => category));
    }
    if (hasOnlyProtectedContent(protectedDoc)) {
      return unchangedContentResult(input, {
        code: "only_protected_content",
        severity: "info",
        message: "The prompt contains only protected content and was left unchanged."
      });
    }
    const normalized = normalizeText(protectedDoc.text);
    const compacted = compactText(normalized.text, locale);
    const rewritten = options.mode === "structured"
      ? structureText(addExplicitConstraintMarkers(compacted.text, protectedDoc.spans, locale), locale)
      : compacted;
    const output = restoreSpans(rewritten.text, protectedDoc.spans);
    const fidelityWarnings = validateFidelity(input, output, protectedDoc.spans);
    const metrics = buildMetrics(input, output);
    const lengthWarnings = metrics.charactersAfter > metrics.charactersBefore
      ? [{
          code: "result_longer" as const,
          severity: "info" as const,
          message: "The tidied prompt is longer because formatting was added."
        }]
      : [];

    const warnings = [...contentWarnings(input, output), ...fidelityWarnings, ...lengthWarnings];
    const rewriteChanges = options.mode === "structured"
      ? [...compacted.changes, ...rewritten.changes]
      : compacted.changes;

    return {
      output,
      changes: [...normalized.changes, ...rewriteChanges],
      warnings,
      metrics,
      safeToReplace: safeToReplace(warnings)
    };
  } catch (error) {
    if (error instanceof UnresolvedProtectedSpanError) return unresolvedSpanResult(input);
    throw error;
  }
}
