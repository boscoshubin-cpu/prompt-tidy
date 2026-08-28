import type { RewriteStageResult } from "./normalize";
import type { ChangeSummary, Locale } from "./types";

type Section = "task" | "background" | "audience" | "requirements" | "constraints" | "output";
type HeadingLocale = "zh" | "en";

interface Marker {
  section: Section;
  pattern: RegExp;
  language: HeadingLocale;
}

const SECTION_ORDER: readonly Section[] = [
  "task",
  "background",
  "audience",
  "requirements",
  "constraints",
  "output"
];

const ZH_MARKERS: readonly Marker[] = [
  { section: "task", pattern: /^(?:任务(?:是|为)?|请(?:你)?(?:帮我)?|帮我)[：:，,\s]*/u, language: "zh" },
  { section: "background", pattern: /^(?:背景信息|背景)(?:是|为)?[：:，,\s]*/u, language: "zh" },
  { section: "audience", pattern: /^(?:目标用户|面向|受众)(?:是|为)?[：:，,\s]*/u, language: "zh" },
  { section: "requirements", pattern: /^(?:要求|需求)(?:是|为)?[：:，,\s]*/u, language: "zh" },
  { section: "constraints", pattern: /^(?:约束|限制)(?:是|为)?[：:，,\s]*/u, language: "zh" },
  { section: "output", pattern: /^(?:输出格式|格式)(?:是|为)?[：:，,\s]*/u, language: "zh" }
];

const EN_MARKERS: readonly Marker[] = [
  { section: "task", pattern: /^(?:task|objective|goal)\s*:\s*/iu, language: "en" },
  { section: "background", pattern: /^(?:background|context)\s*:\s*/iu, language: "en" },
  { section: "audience", pattern: /^(?:target audience|audience)\s*:\s*/iu, language: "en" },
  { section: "requirements", pattern: /^(?:requirements?|needs?)\s*:\s*/iu, language: "en" },
  { section: "constraints", pattern: /^(?:constraints?|limitations?)\s*:\s*/iu, language: "en" },
  { section: "output", pattern: /^(?:output format|format|deliverable)\s*:\s*/iu, language: "en" }
];

const ZH_HEADINGS: Record<Section, string> = {
  task: "任务",
  background: "背景",
  audience: "受众",
  requirements: "要求",
  constraints: "约束",
  output: "输出格式"
};

const EN_HEADINGS: Record<Section, string> = {
  task: "Task",
  background: "Background",
  audience: "Audience",
  requirements: "Requirements",
  constraints: "Constraints",
  output: "Output Format"
};

function splitClauses(text: string): string[] {
  return text.match(/[^\n.!?。！？]+[.!?。！？]*|\n+/gu) ?? [];
}

function trimClause(clause: string): string {
  return clause.replace(/^\s+|\s+$/gu, "");
}

function markersFor(locale: Locale): readonly Marker[] {
  if (locale === "zh") return ZH_MARKERS;
  if (locale === "en") return EN_MARKERS;
  return [...ZH_MARKERS, ...EN_MARKERS];
}

function classifyClause(
  clause: string,
  locale: Locale
): { section: Section; content?: string; language: HeadingLocale } | undefined {
  const zhOutput = clause.match(/^请用(.+?)输出([。！？!?])?$/u);
  if (zhOutput?.[1]) {
    return {
      section: "output",
      content: `使用${zhOutput[1]}${zhOutput[2] ?? ""}`,
      language: "zh"
    };
  }

  for (const marker of markersFor(locale)) {
    const match = clause.match(marker.pattern);
    if (!match) continue;

    const content = trimClause(clause.slice(match[0].length));
    return { section: marker.section, content: content === "" ? undefined : content, language: marker.language };
  }

  return undefined;
}

function isBulleted(section: Section): boolean {
  return section === "requirements" || section === "constraints" || section === "output";
}

/**
 * Groups only clauses with an explicit marker. Clauses without a marker remain
 * in Task, so structure never discards or invents prompt content.
 */
export function structureText(text: string, locale: Locale): RewriteStageResult {
  const sections = new Map<Section, string[]>();
  let activeSection: Section | undefined;
  let markerLanguage: HeadingLocale | undefined;

  for (const rawClause of splitClauses(text)) {
    const clause = trimClause(rawClause);
    if (clause === "") continue;

    const classified = classifyClause(clause, locale);
    if (classified) {
      markerLanguage ??= classified.language;
      if (classified.content === undefined) {
        activeSection = classified.section;
        continue;
      }

      const previousActiveSection = activeSection;
      const values = sections.get(classified.section) ?? [];
      values.push(classified.content);
      sections.set(classified.section, values);
      activeSection = previousActiveSection === classified.section ? previousActiveSection : undefined;
      continue;
    }

    const section = activeSection ?? "task";
    const content = clause;
    const values = sections.get(section) ?? [];
    values.push(content);
    sections.set(section, values);
  }

  if (sections.size < 2) return { text, changes: [] };

  const headingLocale = locale === "auto"
    ? markerLanguage ?? (/\p{Script=Han}/u.test(text) ? "zh" : "en")
    : locale;
  const headings = headingLocale === "en" ? EN_HEADINGS : ZH_HEADINGS;
  const blocks = SECTION_ORDER.flatMap((section) => {
    const values = sections.get(section);
    if (!values || values.length === 0) return [];

    const body = isBulleted(section)
      ? values.map((value) => `- ${value}`).join("\n")
      : values.join(" ");
    return [`## ${headings[section]}\n${body}`];
  });
  const structured = blocks.join("\n\n");
  const changes: ChangeSummary[] = structured === text
    ? []
    : [{ kind: "structured", description: "Organized explicit prompt sections." }];

  return { text: structured, changes };
}
