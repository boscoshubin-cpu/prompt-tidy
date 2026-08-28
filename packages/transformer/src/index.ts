import type { TransformOptions, TransformResult } from "./types";
import { compactText } from "./compact";
import { buildMetrics } from "./metrics";
import { normalizeText } from "./normalize";
import { protectSpans, restoreSpans, type ProtectedSpan } from "./protect";
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

    const isConstraint = /^(?:不要|不得|禁止)/u.test(span.value)
      || /^(?:must not|only)\b/iu.test(span.value);
    const marker = locale === "en"
      ? isConstraint ? "Constraints: " : "Requirements: "
      : isConstraint ? "约束：" : "要求：";
    marked = `${marked.slice(0, tokenIndex)}${marker}${marked.slice(tokenIndex)}`;
  }

  return marked;
}

export function transform(input: string, options: TransformOptions): TransformResult {
  const locale = resolveLocale(input, options.locale);
  const protectedDoc = protectSpans(input);
  const normalized = normalizeText(protectedDoc.text);
  const compacted = compactText(normalized.text, locale);
  const rewritten = options.mode === "structured"
    ? structureText(addExplicitConstraintMarkers(compacted.text, protectedDoc.spans, locale), locale)
    : compacted;
  const output = restoreSpans(rewritten.text, protectedDoc.spans);
  const metrics = buildMetrics(input, output);
  const warnings = metrics.charactersAfter > metrics.charactersBefore
    ? [{
        code: "result_longer" as const,
        severity: "info" as const,
        message: "The tidied prompt is longer because formatting was added."
      }]
    : [];

  return {
    output,
    changes: [...normalized.changes, ...compacted.changes, ...rewritten.changes],
    warnings,
    metrics,
    safeToReplace: true
  };
}
