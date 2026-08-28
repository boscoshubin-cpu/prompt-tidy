import { describe, expect, it } from "vitest";
import { transform } from "./index";

describe("structured mode", () => {
  it("renders only explicit Chinese sections", () => {
    const result = transform(
      "帮我分析这个项目。背景是给新手使用。面向大学生。必须用通俗语言。请用表格输出。",
      { mode: "structured", locale: "zh" }
    );

    expect(result.output).toBe([
      "## 任务",
      "分析这个项目。",
      "",
      "## 背景",
      "给新手使用。",
      "",
      "## 受众",
      "大学生。",
      "",
      "## 要求",
      "- 必须用通俗语言。",
      "",
      "## 输出格式",
      "- 使用表格。"
    ].join("\n"));
    expect(result.output).not.toContain("## 约束\n");
  });

  it("uses explicit English markers and bullets for list-like sections", () => {
    expect(
      transform(
        "Task: Analyze this project. Background: It is for beginners. Audience: College students. Requirements: Use plain language. Output format: Use a table.",
        { mode: "structured", locale: "en" }
      ).output
    ).toBe([
      "## Task",
      "Analyze this project.",
      "",
      "## Background",
      "It is for beginners.",
      "",
      "## Audience",
      "College students.",
      "",
      "## Requirements",
      "- Use plain language.",
      "",
      "## Output Format",
      "- Use a table."
    ].join("\n"));
  });

  it("keeps protected English requirements in their explicit section", () => {
    expect(
      transform("Audience: College students. Must use plain language.", {
        mode: "structured",
        locale: "en"
      }).output
    ).toBe([
      "## Audience",
      "College students.",
      "",
      "## Requirements",
      "- Must use plain language."
    ].join("\n"));
  });

  it("keeps unclassified sentences in Task", () => {
    expect(
      transform("Analyze the pilot. Keep the scope narrow. Audience: College students.", {
        mode: "structured",
        locale: "en"
      }).output
    ).toBe([
      "## Task",
      "Analyze the pilot. Keep the scope narrow.",
      "",
      "## Audience",
      "College students."
    ].join("\n"));
  });

  it("keeps a short prompt as natural language", () => {
    expect(
      transform("Analyze this project.", { mode: "structured", locale: "en" }).output
    ).toBe("Analyze this project.");
  });

  it("does not invent a Role section", () => {
    const result = transform("Task: Analyze this project. Audience: College students.", {
      mode: "structured",
      locale: "en"
    });

    expect(result.output).not.toContain("## Role");
    expect(result.output).toContain("## Task");
    expect(result.output).toContain("## Audience");
  });

  it("labels structured results that are longer as informational", () => {
    const result = transform("分析项目。面向大学生。", { mode: "structured", locale: "zh" });

    expect(result.metrics.charactersAfter).toBeGreaterThan(result.metrics.charactersBefore);
    expect(result.warnings).toContainEqual({
      code: "result_longer",
      severity: "info",
      message: "The tidied prompt is longer because formatting was added."
    });
  });
});
