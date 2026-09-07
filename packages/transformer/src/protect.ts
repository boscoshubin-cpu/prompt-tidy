/** A category of text that must survive a transformation verbatim. */
export type ProtectedCategory =
  | "code_block"
  | "inline_code"
  | "url"
  | "email"
  | "path"
  | "date"
  | "price"
  | "number"
  | "quote"
  | "constraint";

export interface ProtectedSpan {
  token: string;
  category: ProtectedCategory;
  value: string;
}

export interface ProtectionIssue {
  category: ProtectedCategory;
  reason: "ambiguous_syntax";
}

export interface ProtectedDocument {
  text: string;
  spans: readonly ProtectedSpan[];
  issues: readonly ProtectionIssue[];
}

/** Source shared with fidelity validation for bounded negation markers. */
export const NEGATION_MARKER_SOURCE = [
  "不要",
  "不得",
  "禁止",
  "不应",
  "不能",
  "无需",
  "切勿",
  "\\bmust\\s+not\\b",
  "\\bdo\\s+not\\b",
  "\\bdon['’]t\\b",
  "\\bshould\\s+not\\b",
  "\\bcannot\\b",
  "\\bcan['’]t\\b",
  "\\bnever\\b",
  "\\bwithout\\b",
  "\\bnot\\b"
].join("|");

/**
 * Raised when a rewrite has removed a placeholder that was required for
 * verbatim restoration.
 */
export class UnresolvedProtectedSpanError extends Error {
  readonly token: string;
  readonly category: ProtectedCategory;

  constructor(span: Pick<ProtectedSpan, "token" | "category">) {
    super(`Unable to restore protected span (${span.category}): ${span.token}`);
    this.name = "UnresolvedProtectedSpanError";
    this.token = span.token;
    this.category = span.category;
  }
}

interface SpanRule {
  category: ProtectedCategory;
  pattern: RegExp;
}

interface Candidate {
  start: number;
  end: number;
  category: ProtectedCategory;
  value: string;
  priority: number;
}

interface CandidateScan {
  candidates: Candidate[];
  issues: ProtectionIssue[];
  blockedRanges: TextRange[];
}

interface TextRange {
  start: number;
  end: number;
}

const NUMBER_ATOM_SOURCE = [
  "\\d+(?:\\.\\d+){2,}",
  "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?",
  "\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?",
  "\\d+(?:[.,]\\d+)?"
].join("|");

const NUMBER_ATOM_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${NUMBER_ATOM_SOURCE})(?![\\p{L}\\p{N}_])`,
  "gu"
);

const PRICE_PATTERN = new RegExp(
  `(?:[¥$€£]\\s*(?:${NUMBER_ATOM_SOURCE})|(?:${NUMBER_ATOM_SOURCE})\\s*(?:USD|EUR|GBP|CNY|RMB))(?![\\p{L}\\p{N}_])`,
  "giu"
);

// Rules are deliberately ordered from the most structured forms to the most
// general forms. In particular, dates/prices/URLs must win over number.
const SPAN_RULES: readonly SpanRule[] = [
  { category: "url", pattern: /https?:\/\/[^\s<>"'“”‘’「」]+/giu },
  { category: "email", pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu },
  {
    category: "path",
    pattern: /(?:\.{1,2}|~(?:[\p{L}\p{N}._-]+)?)\/(?:[^\s<>"'“”‘’\/]+\/)*[^\s<>"'“”‘’\/]+|(?:\.{1,2}\\)(?:[^\\\s<>"'“”‘’]+\\)*[^\\\s<>"'“”‘’]+|\/\/(?:[^\s<>"'“”‘’\/]+\/)+[^\s<>"'“”‘’\/]+|\\\\(?:[^\\\s<>"'“”‘’]+\\)+[^\\\s<>"'“”‘’]+|\/(?:[^\s<>"'“”‘’\/]+\/)*[^\s<>"'“”‘’\/]+|[a-z]:[\\/](?:[^\s<>"'“”‘’]+[\\/]?)+/giu
  },
  { category: "date", pattern: /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g },
  { category: "price", pattern: PRICE_PATTERN },
  { category: "quote", pattern: /“[^”\r\n]*”|「[^」\r\n]*」|《[^》\r\n]*》|(?<!\w)"[^"\r\n]*"|(?<!\w)'[^'\r\n]*'(?!\w)/gu },
  {
    category: "constraint",
    pattern: new RegExp(
      `(?:${NEGATION_MARKER_SOURCE}|必须|\\bmust\\b|\\bonly\\b)[^，,。.!！？?；;:\\n]*`,
      "giu"
    )
  },
  { category: "number", pattern: NUMBER_ATOM_PATTERN }
];

let nonceCounter = 0;

function nextNonce(): string {
  nonceCounter += 1;

  // crypto.randomUUID is not available in every supported runtime, while
  // getRandomValues is available in browsers and current Node versions.
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(2);
    cryptoObject.getRandomValues(values);
    return `${(values[0] ?? 0).toString(36)}${(values[1] ?? 0).toString(36)}-${nonceCounter.toString(36)}`;
  }

  return `${Date.now().toString(36)}-${nonceCounter.toString(36)}`;
}

function tokenFor(nonce: string, index: number): string {
  // Private-use delimiters make accidental natural-language matches unlikely,
  // while the nonce prevents collision with literal placeholder-looking input.
  return `\uE000prompt-tidy-${nonce}-${index}\uE001`;
}

function findLegacyTripleBacktickCandidates(input: string): CandidateScan {
  const candidates = [...input.matchAll(/(?<!`)```(?!`)[\s\S]*?(?<!`)```(?!`)/gu)].map((match) => {
    const start = match.index ?? 0;
    return {
      start,
      end: start + match[0].length,
      category: "code_block" as const,
      value: match[0],
      priority: -3
    };
  });

  return {
    candidates,
    issues: [],
    blockedRanges: candidates.map(({ start, end }) => ({ start, end }))
  };
}

function findMarkdownFenceCandidates(
  input: string,
  existingRanges: readonly TextRange[]
): CandidateScan {
  const candidates: Candidate[] = [];
  const issues: ProtectionIssue[] = [];
  const blockedRanges: TextRange[] = [];
  const openingPattern = /^( {0,3})(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gmu;
  let protectedThrough = -1;

  for (const opening of input.matchAll(openingPattern)) {
    const start = opening.index ?? 0;
    if (start < protectedThrough) continue;
    const existingRange = rangeContaining(start, existingRanges);
    const legacyStartsInsideEarlierFence = existingRange
      ? rangeContaining(existingRange.start, blockedRanges)
      : undefined;
    if (existingRange && existingRange.start < start && !legacyStartsInsideEarlierFence) continue;

    const marker = opening[2];
    if (!marker) continue;
    const markerCharacter = marker[0];
    if (!markerCharacter) continue;

    const closingPattern = /^( {0,3})(`{3,}|~{3,})[ \t]*\r?$/gmu;
    closingPattern.lastIndex = start + opening[0].length;
    let closing: RegExpExecArray | null;
    let end: number | undefined;

    while ((closing = closingPattern.exec(input)) !== null) {
      const closingMarker = closing[2];
      if (
        closingMarker?.[0] === markerCharacter
        && closingMarker.length >= marker.length
      ) {
        end = (closing.index ?? 0) + closing[0].length;
        break;
      }
    }

    if (end === undefined) {
      issues.push({ category: "code_block", reason: "ambiguous_syntax" });
      blockedRanges.push({ start, end: input.length });
      protectedThrough = input.length;
      continue;
    }

    candidates.push({
      start,
      end,
      category: "code_block",
      value: input.slice(start, end),
      priority: -1
    });
    blockedRanges.push({ start, end });
    protectedThrough = end;
  }

  return { candidates, issues, blockedRanges };
}

function overlapsRange(start: number, end: number, ranges: readonly TextRange[]): boolean {
  return ranges.some((range) => start < range.end && range.start < end);
}

interface LineRange {
  start: number;
  contentEnd: number;
  nextStart: number;
  content: string;
}

function lineRanges(input: string): LineRange[] {
  const lines: LineRange[] = [];
  let start = 0;

  while (start < input.length) {
    const newline = input.indexOf("\n", start);
    const nextStart = newline < 0 ? input.length : newline + 1;
    const rawContentEnd = newline < 0 ? input.length : newline;
    const contentEnd = rawContentEnd > start && input[rawContentEnd - 1] === "\r"
      ? rawContentEnd - 1
      : rawContentEnd;
    lines.push({
      start,
      contentEnd,
      nextStart,
      content: input.slice(start, contentEnd)
    });
    start = nextStart;
  }

  return lines;
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}|\t)/u.test(line);
}

function findMarkdownIndentedCodeCandidates(
  input: string,
  blockedRanges: readonly TextRange[]
): CandidateScan {
  const candidates: Candidate[] = [];
  const lines = lineRanges(input);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (
      !line
      || !isIndentedCodeLine(line.content)
      || overlapsRange(line.start, line.nextStart, blockedRanges)
    ) {
      index += 1;
      continue;
    }

    const start = line.start;
    let lastCodeLine = line;
    let cursor = index + 1;
    while (cursor < lines.length) {
      const candidateLine = lines[cursor];
      if (!candidateLine || overlapsRange(candidateLine.start, candidateLine.nextStart, blockedRanges)) break;
      if (isIndentedCodeLine(candidateLine.content)) {
        lastCodeLine = candidateLine;
        cursor += 1;
        continue;
      }
      if (candidateLine.content.trim() === "") {
        cursor += 1;
        continue;
      }
      break;
    }

    const end = lastCodeLine.contentEnd;
    candidates.push({
      start,
      end,
      category: "code_block",
      value: input.slice(start, end),
      priority: -2
    });
    index = lines.findIndex((candidateLine) => candidateLine.start >= end);
    if (index < 0) index = lines.length;
    if (lines[index]?.start === start) index += 1;
  }

  return {
    candidates,
    issues: [],
    blockedRanges: candidates.map(({ start, end }) => ({ start, end }))
  };
}

function rangeContaining(offset: number, ranges: readonly TextRange[]): TextRange | undefined {
  return ranges.find((range) => range.start <= offset && offset < range.end);
}

function findInlineCodeCandidates(
  input: string,
  blockedRanges: readonly TextRange[]
): CandidateScan {
  const candidates: Candidate[] = [];
  const issues: ProtectionIssue[] = [];
  let index = 0;

  while (index < input.length) {
    const blocked = rangeContaining(index, blockedRanges);
    if (blocked) {
      index = blocked.end;
      continue;
    }
    if (input[index] !== "`") {
      index += 1;
      continue;
    }

    const start = index;
    while (input[index] === "`") index += 1;
    const delimiterLength = index - start;
    let searchOffset = index;
    let closingEnd: number | undefined;

    while (searchOffset < input.length) {
      const searchBlocked = rangeContaining(searchOffset, blockedRanges);
      if (searchBlocked) {
        searchOffset = searchBlocked.end;
        continue;
      }
      const nextRun = input.indexOf("`", searchOffset);
      if (nextRun < 0) break;
      const nextRunBlocked = rangeContaining(nextRun, blockedRanges);
      if (nextRunBlocked) {
        searchOffset = nextRunBlocked.end;
        continue;
      }

      let runEnd = nextRun;
      while (input[runEnd] === "`") runEnd += 1;
      if (runEnd - nextRun === delimiterLength) {
        closingEnd = runEnd;
        break;
      }
      searchOffset = runEnd;
    }

    if (closingEnd === undefined) {
      const category = delimiterLength >= 3 && /[\r\n]/u.test(input.slice(start))
        ? "code_block"
        : "inline_code";
      issues.push({ category, reason: "ambiguous_syntax" });
      break;
    }

    const value = input.slice(start, closingEnd);
    const category = delimiterLength >= 3 && /[\r\n]/u.test(value)
      ? "code_block"
      : "inline_code";
    candidates.push({
      start,
      end: closingEnd,
      category,
      value,
      priority: -1
    });
    index = closingEnd;
  }

  return {
    candidates,
    issues,
    blockedRanges: candidates.map(({ start, end }) => ({ start, end }))
  };
}

function findCandidates(input: string): CandidateScan {
  const legacyTripleScan = findLegacyTripleBacktickCandidates(input);
  const fenced = findMarkdownFenceCandidates(input, legacyTripleScan.blockedRanges);
  const legacyCandidates = legacyTripleScan.candidates.filter(
    ({ start }) => !rangeContaining(start, fenced.blockedRanges)
  );
  const legacyTriple: CandidateScan = {
    candidates: legacyCandidates,
    issues: legacyTripleScan.issues,
    blockedRanges: legacyCandidates.map(({ start, end }) => ({ start, end }))
  };
  const preIndentedRanges = [...fenced.blockedRanges, ...legacyTriple.blockedRanges];
  const indented = findMarkdownIndentedCodeCandidates(input, preIndentedRanges);
  const codeBlockRanges = [...preIndentedRanges, ...indented.blockedRanges];
  const inline = findInlineCodeCandidates(input, codeBlockRanges);
  const candidates: Candidate[] = [
    ...legacyTriple.candidates,
    ...fenced.candidates,
    ...indented.candidates,
    ...inline.candidates
  ];

  SPAN_RULES.forEach((rule, priority) => {
    for (const match of input.matchAll(rule.pattern)) {
      const rawValue = match[0];
      // Whitespace immediately before a boundary belongs outside the clause;
      // all URL/path punctuation remains part of its exact protected value.
      const value = rule.category === "constraint" ? rawValue.trimEnd() : rawValue;
      if (value.length === 0) continue;

      const start = match.index ?? 0;
      candidates.push({
        start,
        end: start + value.length,
        category: rule.category,
        value,
        priority: priority + 1
      });
    }
  });

  candidates.sort((left, right) => left.start - right.start || left.priority - right.priority);

  const selected: Candidate[] = [];
  for (const candidate of candidates) {
    const overlaps = selected.some(
      (existing) => candidate.start < existing.end && existing.start < candidate.end
    );
    if (!overlaps) selected.push(candidate);
  }

  const hasAmbiguousWhitespacePath = selected.some((candidate) => (
    candidate.category === "path"
    && /^[\t ]{2,}\S/u.test(input.slice(candidate.end))
  ));

  return {
    candidates: selected,
    issues: [
      ...fenced.issues,
      ...legacyTriple.issues,
      ...indented.issues,
      ...inline.issues,
      ...(hasAmbiguousWhitespacePath
        ? [{ category: "path" as const, reason: "ambiguous_syntax" as const }]
        : [])
    ],
    blockedRanges: [...codeBlockRanges, ...inline.blockedRanges]
  };
}

function collisionSafeNonce(input: string, values: readonly string[]): string {
  let nonce = nextNonce();
  while (values.some((_value, index) => input.includes(tokenFor(nonce, index)))) {
    nonce = nextNonce();
  }
  return nonce;
}

export function protectSpans(input: string): ProtectedDocument {
  const { candidates, issues } = findCandidates(input);
  const nonce = collisionSafeNonce(input, candidates.map((candidate) => candidate.value));
  const spans: ProtectedSpan[] = candidates.map((candidate, index) => ({
    token: tokenFor(nonce, index),
    category: candidate.category,
    value: candidate.value
  }));

  let text = input;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const span = spans[index];
    if (candidate && span) {
      text = `${text.slice(0, candidate.start)}${span.token}${text.slice(candidate.end)}`;
    }
  }

  return { text, spans, issues };
}

export function restoreSpans(text: string, spans: readonly ProtectedSpan[]): string {
  for (const span of spans) {
    if (!text.includes(span.token)) {
      throw new UnresolvedProtectedSpanError(span);
    }
  }

  let restored = text;
  for (const span of spans) {
    restored = restored.split(span.token).join(span.value);
  }
  return restored;
}
