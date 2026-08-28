import type { TransformMetrics } from "./types";

/**
 * A local, deterministic length heuristic rather than model-specific
 * tokenization. Han code points, Latin/digit runs, and non-whitespace
 * punctuation each contribute one weighted unit.
 */
export function estimateTokens(text: string): number {
  let weightedUnits = 0;
  let inWordLikeRun = false;

  for (const codePoint of text) {
    if (/\p{Script=Han}/u.test(codePoint)) {
      weightedUnits += 1;
      inWordLikeRun = false;
    } else if (/[\p{Script=Latin}\p{Number}]/u.test(codePoint)) {
      if (!inWordLikeRun) weightedUnits += 1;
      inWordLikeRun = true;
    } else {
      inWordLikeRun = false;
      if (!/\s/u.test(codePoint)) weightedUnits += 1;
    }
  }

  return Math.ceil(weightedUnits);
}

export function buildMetrics(before: string, after: string): TransformMetrics {
  return {
    charactersBefore: before.length,
    charactersAfter: after.length,
    estimatedTokensBefore: estimateTokens(before),
    estimatedTokensAfter: estimateTokens(after)
  };
}
