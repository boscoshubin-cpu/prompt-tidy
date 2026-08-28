import type { ChangeSummary } from "./types";

export interface RewriteStageResult {
  text: string;
  changes: ChangeSummary[];
}

function normalizeLine(line: string): string {
  const indentation = line.match(/^[\t ]*/u)?.[0] ?? "";
  const content = line.slice(indentation.length).replace(/[\t ]+/gu, " ").trim();

  return /^(?:[-*+]|\d+[.)])(?:\s|$)/u.test(content) ? `${indentation}${content}` : content;
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
    .map(normalizeLine)
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n");

  return {
    text: normalized,
    changes: normalized === text
      ? []
      : [{ kind: "normalized", description: "Normalized whitespace and paragraph breaks." }]
  };
}
