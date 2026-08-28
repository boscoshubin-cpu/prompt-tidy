import type { TransformOptions, TransformResult } from "./types";
import { compactText } from "./compact";
import { normalizeText } from "./normalize";
import { protectSpans, restoreSpans } from "./protect";

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

export function transform(input: string, options: TransformOptions): TransformResult {
  const estimatedTokens = Math.ceil(input.length / 4);
  const isCompact = options.mode === "compact";
  const protectedDoc = isCompact ? protectSpans(input) : undefined;
  const normalized = protectedDoc ? normalizeText(protectedDoc.text) : undefined;
  const rewritten = normalized ? compactText(normalized.text, resolveLocale(input, options.locale)) : undefined;
  const output = protectedDoc && rewritten
    ? restoreSpans(rewritten.text, protectedDoc.spans)
    : input;

  return {
    output,
    changes: normalized && rewritten ? [...normalized.changes, ...rewritten.changes] : [],
    warnings: [],
    metrics: {
      charactersBefore: input.length,
      charactersAfter: input.length,
      estimatedTokensBefore: estimatedTokens,
      estimatedTokensAfter: estimatedTokens
    },
    safeToReplace: true
  };
}
