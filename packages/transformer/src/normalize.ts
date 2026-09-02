import type { ChangeSummary } from "./types";

export interface RewriteStageResult {
  text: string;
  changes: ChangeSummary[];
}

function lineParts(line: string): { content: string; indentation: string; listItem: boolean } {
  const indentation = line.match(/^[\t ]*/u)?.[0] ?? "";
  const content = line.slice(indentation.length).replace(/[\t ]+/gu, " ").trim();

  return {
    content,
    indentation,
    listItem: /^(?:[-*+]|\d+[.)])(?:\s|$)/u.test(content)
  };
}

function normalizeLines(lines: readonly string[]): string[] {
  let inList = false;

  return lines.map((line) => {
    const { content, indentation, listItem } = lineParts(line);
    const continuation = inList && indentation !== "" && content !== "";

    if (listItem) {
      inList = true;
    } else if (content !== "" && indentation === "") {
      inList = false;
    }

    return listItem || continuation ? `${indentation}${content}` : content;
  });
}

/**
 * Makes whitespace predictable without inspecting or changing protected
 * placeholders. Paragraph breaks remain intact, while runs of blank lines are
 * reduced to a single blank line.
 */
export function normalizeText(text: string): RewriteStageResult {
  const normalized = normalizeLines(text
    .replace(/\r\n?/gu, "\n")
    .split("\n"))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n");

  return {
    text: normalized,
    changes: normalized === text
      ? []
      : [{ kind: "normalized", description: "Normalized whitespace and paragraph breaks." }]
  };
}
