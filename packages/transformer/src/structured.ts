import type { RewriteStageResult } from "./normalize";
import type { ChangeSummary, Locale } from "./types";

type Section = "task" | "background" | "audience" | "requirements" | "constraints" | "output";

interface Marker {
  section: Section;
  pattern: RegExp;
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
  { section: "task", pattern: /^(?:任务(?:是|为)?|请(?:你)?(?:帮我)?|帮我)[：:，,\s]*/u },
  { section: "background", pattern: /^(?:背景信息|背景)(?:是|为)?[：:，,\s]*/u },
  { section: "audience", pattern: /^(?:目标用户|面向|受众)(?:是|为)?[：:，,\s]*/u },
  { section: "requirements", pattern: /^(?:要求|需求)(?:是|为)?[：:，,\s]*/u },
  { section: "constraints", pattern: /^(?:约束|限制)(?:是|为)?[：:，,\s]*/u },
  { section: "output", pattern: /^(?:输出格式|格式)(?:是|为)?[：:，,\s]*/u }
];

const EN_MARKERS: readonly Marker[] = [
  { section: "task", pattern: /^(?:task|objective|goal)\s*:\s*/iu },
  { section: "background", pattern: /^(?:background|context)\s*:\s*/iu },
  { section: "audience", pattern: /^(?:target audience|audience)\s*:\s*/iu },
  { section: "requirements", pattern: /^(?:requirements?|needs?)\s*:\s*/iu },
  { section: "constraints", pattern: /^(?:constraints?|limitations?)\s*:\s*/iu },
  { section: "output", pattern: /^(?:output format|format|deliverable)\s*:\s*/iu }
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

function classifyClause(clause: string, locale: Locale): { section: Section; content: string } | undefined {
  const zhOutput = clause.match(/^请用(.+?)输出([。！？!?])?$/u);
  if (zhOutput?.[1]) {
    return { section: "output", content: `使用${zhOutput[1]}${zhOutput[2] ?? ""}` };
  }

  for (const marker of markersFor(locale)) {
    const match = clause.match(marker.pattern);
    if (!match) continue;

    const content = trimClause(clause.slice(match[0].length));
    if (content !== "") return { section: marker.section, content };
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

  for (const rawClause of splitClauses(text)) {
    const clause = trimClause(rawClause);
    if (clause === "") continue;

    const classified = classifyClause(clause, locale);
    const section = classified?.section ?? "task";
    const content = classified?.content ?? clause;
    const values = sections.get(section) ?? [];
    values.push(content);
    sections.set(section, values);
  }

  if (sections.size < 2) return { text, changes: [] };

  const headings = locale === "en" ? EN_HEADINGS : ZH_HEADINGS;
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
