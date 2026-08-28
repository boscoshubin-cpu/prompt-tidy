import type { ChangeSummary } from "./types";

export interface RewriteStageResult {
  text: string;
  changes: ChangeSummary[];
}

/**
 * Makes whitespace predictable without inspecting or changing protected
 * placeholders. Paragraph breaks remain intact, while runs of blank lines are
 * reduced to a single blank line.
 */
export function normalizeText(text: string): RewriteStageResult {
  const normalized = text
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n");

  return {
    text: normalized,
    changes: normalized === text
      ? []
      : [{ kind: "normalized", description: "Normalized whitespace and paragraph breaks." }]
  };
}
