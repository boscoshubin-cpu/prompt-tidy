import type { ChangeSummary, Locale } from "./types";
import type { RewriteStageResult } from "./normalize";

const ZH_PREFIX_RULES = [
  /^(?:就是说|然后呢)[，,\s]*/u,
  /^(?:我想让你|请你|麻烦你)(?:帮我)?[，, \t]*/u
] as const;

const EN_PREFIX_RULES = [
  /^(?:could you please|please)\s+(?:(?:help me to|help me)[,\s]+)?(?:basically[,\s]+)?(?=(?:summarize|analyze|rewrite|draft|create|list|explain|compare|translate|review|give|provide|write)\b)/iu
] as const;

function applyLeadingRules(text: string, rules: readonly RegExp[]): { text: string; removed: boolean } {
  let result = text;
  let removed = false;

  for (const rule of rules) {
    const next = result.replace(rule, "");
    if (next !== result) removed = true;
    result = next;
  }

  return { text: result, removed };
}

function cleanupPunctuation(text: string): string {
  return text
    .replace(/^(?:[,;:][ \t]*)+/u, "")
    .replace(/[ \t]+([,.;!?])/gu, "$1")
    .replace(/([,;:])(?:[ \t]*[,;:])+/gu, "$1")
    .replace(/([,;:])[ \t]+/gu, "$1 ");
}

function compactChinese(text: string): { text: string; removed: boolean } {
  const prefixed = applyLeadingRules(text, ZH_PREFIX_RULES);
  let result = prefixed.text;

  // These phrases are only removed in their conversational positions, rather
  // than through a free-standing substring replacement.
  result = result.replace(/([，,])然后呢[，,\s]*/gu, "$1");
  result = result.replace(/^分析一下(?=(?:这个|此|该))/u, "分析");
  result = result.replace(
    /([，,])给我(?=[一二三四五六七八九十]+(?:个)?(?:步骤|要点|建议))/gu,
    "$1给出"
  );

  return { text: cleanupPunctuation(result), removed: prefixed.removed || result !== prefixed.text };
}

function compactEnglish(text: string): { text: string; removed: boolean } {
  const prefixed = applyLeadingRules(text, EN_PREFIX_RULES);
  let result = prefixed.text;
  const withoutFiller = result.replace(/^(?:basically)[,\s]+/iu, "");
  const removed = prefixed.removed || withoutFiller !== result;
  result = cleanupPunctuation(withoutFiller);

  if (removed) {
    result = result.replace(/^([a-z])/u, (_match, letter: string) => letter.toUpperCase());
    result = result.replace(/\?$/u, ".");
  }

  return { text: result, removed };
}

function deduplicateLine(line: string): { text: string; removed: boolean } {
  const clauses = line.match(/[^。！？!?.]+[。！？!?.]?/gu);
  if (!clauses) return { text: line, removed: false };

  const kept: string[] = [];
  let previous = "";
  let removed = false;

  for (const clause of clauses) {
    const normalizedClause = clause.trim();
    if (normalizedClause === "") continue;
    if (normalizedClause === previous) {
      removed = true;
      continue;
    }
    kept.push(clause);
    previous = normalizedClause;
  }

  return { text: removed ? kept.join("") : line, removed };
}

function deduplicateAdjacentClauses(text: string): { text: string; removed: boolean } {
  const lines = text.split("\n");
  let removed = false;
  const deduplicated = lines.map((line) => {
    const result = deduplicateLine(line);
    if (result.removed) removed = true;
    return result.text;
  });

  return { text: deduplicated.join("\n"), removed };
}

/** Applies only explicitly-listed filler and exact adjacent-clause rules. */
export function compactText(text: string, locale: Locale): RewriteStageResult {
  const compacted = locale === "zh"
    ? compactChinese(text)
    : locale === "en"
      ? compactEnglish(text)
      : (() => {
          const chinese = compactChinese(text);
          const english = compactEnglish(chinese.text);
          return { text: english.text, removed: chinese.removed || english.removed };
        })();
  const deduplicated = deduplicateAdjacentClauses(compacted.text);
  const changes: ChangeSummary[] = [];

  if (compacted.removed) {
    changes.push({ kind: "removed_filler", description: "Removed conservative conversational filler." });
  }
  if (deduplicated.removed) {
    changes.push({ kind: "deduplicated", description: "Removed adjacent duplicate clauses." });
  }

  return { text: deduplicated.text, changes };
}
