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

export interface ProtectedDocument {
  text: string;
  spans: readonly ProtectedSpan[];
}

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

// Rules are deliberately ordered from the most structured forms to the most
// general forms. In particular, dates/prices/URLs must win over number.
const SPAN_RULES: readonly SpanRule[] = [
  { category: "code_block", pattern: /```[\s\S]*?```/g },
  { category: "inline_code", pattern: /`[^`\r\n]*`/g },
  { category: "url", pattern: /https?:\/\/[^\s<>"'“”‘’「」]+/giu },
  { category: "email", pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu },
  {
    category: "path",
    pattern: /(?:\/[a-z0-9._~-]+)+(?:\/[a-z0-9._~%-]+)?|[a-z]:[\\/](?:[^\s<>"'“”‘’]+[\\/]?)+/giu
  },
  { category: "date", pattern: /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g },
  { category: "price", pattern: /(?:[¥$€£]\s*\d+(?:[,.]\d+)?|\d+(?:[,.]\d+)?\s*(?:USD|EUR|GBP|CNY|RMB))/giu },
  { category: "quote", pattern: /“[^”\r\n]*”|「[^」\r\n]*」|《[^》\r\n]*》|(?<!\w)"[^"\r\n]*"|(?<!\w)'[^'\r\n]*'(?!\w)/gu },
  { category: "constraint", pattern: /(?:must\s+not|must|only)\b|不要|必须/giu },
  { category: "number", pattern: /\b\d+(?:[.,]\d+)?\b/g }
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

function trimTrailingPunctuation(value: string): string {
  // Sentence punctuation commonly follows URLs and paths. Do not trim '?',
  // which can be a meaningful final URL query marker.
  return value.replace(/[.,!;:]+$/u, "");
}

function findCandidates(input: string): Candidate[] {
  const candidates: Candidate[] = [];

  SPAN_RULES.forEach((rule, priority) => {
    for (const match of input.matchAll(rule.pattern)) {
      const rawValue = match[0];
      const value = rule.category === "url" || rule.category === "path"
        ? trimTrailingPunctuation(rawValue)
        : rawValue;
      if (value.length === 0) continue;

      const start = match.index ?? 0;
      candidates.push({
        start,
        end: start + value.length,
        category: rule.category,
        value,
        priority
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

  return selected;
}

function collisionSafeNonce(input: string, values: readonly string[]): string {
  let nonce = nextNonce();
  while (values.some((_value, index) => input.includes(tokenFor(nonce, index)))) {
    nonce = nextNonce();
  }
  return nonce;
}

export function protectSpans(input: string): ProtectedDocument {
  const candidates = findCandidates(input);
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

  return { text, spans };
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
