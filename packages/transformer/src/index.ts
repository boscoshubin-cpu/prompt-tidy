import type { TransformOptions, TransformResult } from "./types";

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

export function transform(input: string, _options: TransformOptions): TransformResult {
  const estimatedTokens = Math.ceil(input.length / 4);

  return {
    output: input,
    changes: [],
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
