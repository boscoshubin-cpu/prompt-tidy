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

  it("keeps a standalone English header active for protected requirement lines", () => {
    expect(
      transform("Requirements:\nMust use plain language.\nUse accessible examples.\nAudience: College students.", {
        mode: "structured",
        locale: "en"
      }).output
    ).toBe([
      "## Audience",
      "College students.",
      "",
      "## Requirements",
      "- Must use plain language.",
      "- Use accessible examples."
    ].join("\n"));
  });

  it("keeps a standalone Chinese header active for non-Must requirement lines", () => {
    expect(
      transform("要求：\n使用通俗语言。\n受众：\n大学生。", {
        mode: "structured",
        locale: "zh"
      }).output
    ).toBe([
      "## 受众",
      "大学生。",
      "",
      "## 要求",
      "- 使用通俗语言。"
    ].join("\n"));
  });

  it("uses explicit English labels for headings with Han content in auto locale", () => {
    expect(
      transform("Task: 分析项目。 Audience: 大学生。", { mode: "structured", locale: "auto" }).output
    ).toBe([
      "## Task",
      "分析项目。",
      "",
      "## Audience",
      "大学生。"
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

  it("keeps grouped decimals atomic in Structured mode", () => {
    const result = transform(
      "Task: Analyze revenue of 1,234.56 USD. Output format: Use a table.",
      { mode: "structured", locale: "en" }
    );

    expect(result.output).toContain("Analyze revenue of 1,234.56 USD.");
    expect(result.output).not.toContain("1,234. 56.");
    expect(result.safeToReplace).toBe(true);
  });

  it.each([
    ["config.apiEndpoint", "Task: Review config.apiEndpoint. Audience: Developers."],
    ["api.example.com", "Task: Review api.example.com. Audience: Developers."],
    ["client.auth.token", "Task: Review client.auth.token. Audience: Developers."]
  ])("keeps dotted atom %s intact in Structured mode", (atom, input) => {
    const result = transform(input, { mode: "structured", locale: "en" });

    expect(result.output).toBe([
      "## Task",
      `Review ${atom}.`,
      "",
      "## Audience",
      "Developers."
    ].join("\n"));
    expect(result.safeToReplace).toBe(true);
  });

  it("preserves tilde fences and relative paths in Structured mode", () => {
    const fence = ["~~~js", "  import app from './src/app.ts';", "~~~~"].join("\n");
    const input = `Task: Review ./src/app.ts. Background: Use this code:\n${fence}`;
    const result = transform(input, { mode: "structured", locale: "en" });

    expect(result.output).toContain("./src/app.ts");
    expect(result.output).toContain(fence);
    expect(result.safeToReplace).toBe(true);
  });

  it("leaves an unclosed fence unchanged and blocks replacement", () => {
    const input = "Task: Review this code.\n~~~js\nconst total = 1,234.56;";
    const result = transform(input, { mode: "structured", locale: "en" });

    expect(result.output).toBe(input);
    expect(result.safeToReplace).toBe(false);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "critical_content_missing",
      category: "code_block",
      severity: "error"
    }));
  });
});
