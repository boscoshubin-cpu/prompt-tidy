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
}

const NUMBER_ATOM_SOURCE = [
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
  // The line-aware Markdown fence scanner runs before these regex rules. This
  // legacy form conservatively protects embedded triple-backtick blocks too.
  { category: "code_block", pattern: /```[\s\S]*?```/g },
  { category: "inline_code", pattern: /`[^`\r\n]*`/g },
  { category: "url", pattern: /https?:\/\/[^\s<>"'“”‘’「」]+/giu },
  { category: "email", pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu },
  {
    category: "path",
    pattern: /(?:\.{1,2}|~(?:[\p{L}\p{N}._-]+)?)\/(?:[^\s<>"'“”‘’\/]+\/)*[^\s<>"'“”‘’\/]+|\/\/(?:[^\s<>"'“”‘’\/]+\/)+[^\s<>"'“”‘’\/]+|\\\\(?:[^\\\s<>"'“”‘’]+\\)+[^\\\s<>"'“”‘’]+|\/(?:[^\s<>"'“”‘’\/]+\/)*[^\s<>"'“”‘’\/]+|[a-z]:[\\/](?:[^\s<>"'“”‘’]+[\\/]?)+/giu
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

function findMarkdownFenceCandidates(input: string): CandidateScan {
  const candidates: Candidate[] = [];
  const issues: ProtectionIssue[] = [];
  const openingPattern = /^( {0,3})(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gmu;
  let protectedThrough = -1;

  for (const opening of input.matchAll(openingPattern)) {
    const start = opening.index ?? 0;
    if (start < protectedThrough) continue;

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
    protectedThrough = end;
  }

  return { candidates, issues };
}

function findCandidates(input: string): CandidateScan {
  const fenced = findMarkdownFenceCandidates(input);
  const candidates: Candidate[] = [...fenced.candidates];

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

  return { candidates: selected, issues: fenced.issues };
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
