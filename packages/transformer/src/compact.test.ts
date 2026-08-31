import { describe, expect, it } from "vitest";
import { transform } from "./index";

describe("compact mode", () => {
  it.each([
    [
      "就是说我想让你帮我分析一下这个项目，然后呢给我三个步骤。",
      "分析这个项目，给出三个步骤。",
      "zh"
    ],
    [
      "Could you please help me, basically, summarize this report in 5 bullets?",
      "Summarize this report in 5 bullets.",
      "en"
    ],
    [
      "不要删除 2026-08-28 和 https://example.com。",
      "不要删除 2026-08-28 和 https://example.com。",
      "zh"
    ]
  ] as const)("compacts safely", (input, output, locale) => {
    expect(transform(input, { mode: "compact", locale }).output).toBe(output);
  });

  it("removes only immediately adjacent duplicate clauses", () => {
    expect(
      transform("Summarize the report. Summarize the report.", {
        mode: "compact",
        locale: "en"
      }).output
    ).toBe("Summarize the report.");
  });

  it("applies safe framing cleanup to mixed Chinese and English input", () => {
    expect(
      transform("请你帮我 Summarize this report. Summarize this report.", {
        mode: "compact",
        locale: "auto"
      }).output
    ).toBe("Summarize this report.");
  });

  it("normalizes multiline whitespace while retaining paragraph breaks", () => {
    expect(
      transform("  请你帮我总结报告。 \r\n\r\n  给出 3 个要点。  ", {
        mode: "compact",
        locale: "zh"
      }).output
    ).toBe("总结报告。\n\n给出 3 个要点。");
  });

  it("leaves already concise input unchanged", () => {
    expect(transform("Summarize this report.", { mode: "compact", locale: "en" }).output).toBe(
      "Summarize this report."
    );
  });

  it.each(["Help me", "Help me with this."])("preserves meaningful English request: %s", (input) => {
    expect(transform(input, { mode: "compact", locale: "en" }).output).toBe(input);
  });

  it("leaves code-only input byte-for-byte unchanged", () => {
    const input = "```\n  npm test -- --runInBand\n```";

    expect(transform(input, { mode: "compact", locale: "en" }).output).toBe(input);
  });

  it("retains nested-list indentation", () => {
    const input = "- parent\n  - child";

    expect(transform(input, { mode: "compact", locale: "en" }).output).toBe(input);
  });

  it("retains list indentation adjacent to a protected code block", () => {
    const input = "Use this:\n```ts\n  const total = 3;\n```\n  - nested note";

    expect(transform(input, { mode: "compact", locale: "en" }).output).toBe(input);
  });

  it("retains the code-block newline after removing a Chinese prefix", () => {
    const input = "请你:\n```ts\n  const total = 3;\n```";

    expect(transform(input, { mode: "compact", locale: "zh" }).output).toBe(
      "\n```ts\n  const total = 3;\n```"
    );
  });

  it("preserves a tilde-fenced block byte-for-byte in Compact mode", () => {
    const input = "Use this:\n~~~js\n  const total = 1,234.56;\n~~~";

    expect(transform(input, { mode: "compact", locale: "en" }).output).toBe(input);
  });

  it("preserves relative path separation and a grouped decimal after safe filler removal", () => {
    const result = transform("Could you please review ./src/app.ts with 1,234.56 rows?", {
      mode: "compact",
      locale: "en"
    });

    expect(result.output).toBe("Review ./src/app.ts with 1,234.56 rows.");
    expect(result.safeToReplace).toBe(true);
  });

  it("preserves chained punctuation across a line boundary", () => {
    const input = "Keep this,\n; keep that.";

    expect(transform(input, { mode: "compact", locale: "en" }).output).toBe(input);
  });

  it("preserves Chinese sentence separators with automatic locale", () => {
    expect(transform("请完成。然后提交。", { mode: "compact", locale: "auto" }).output).toBe(
      "请完成。然后提交。"
    );
  });

  it("preserves non-leading Chinese 分析一下", () => {
    const input = "我们需要分析一下这个项目。";

    expect(transform(input, { mode: "compact", locale: "zh" }).output).toBe(input);
  });

  it("is idempotent after compacting", () => {
    const options = { mode: "compact", locale: "en" } as const;
    const first = transform(
      "Could you please help me, basically, summarize this report in 5 bullets?",
      options
    );

    expect(transform(first.output, options).output).toBe(first.output);
  });

  it("reports each Compact rewrite change only once", () => {
    const result = transform("Could you please summarize this report?", {
      mode: "compact",
      locale: "en"
    });

    expect(result.changes.filter(({ kind }) => kind === "removed_filler")).toHaveLength(1);
  });
});
