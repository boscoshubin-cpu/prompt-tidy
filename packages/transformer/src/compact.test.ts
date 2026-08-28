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

  it("leaves code-only input byte-for-byte unchanged", () => {
    const input = "```\n  npm test -- --runInBand\n```";

    expect(transform(input, { mode: "compact", locale: "en" }).output).toBe(input);
  });

  it("is idempotent after compacting", () => {
    const options = { mode: "compact", locale: "en" } as const;
    const first = transform(
      "Could you please help me, basically, summarize this report in 5 bullets?",
      options
    );

    expect(transform(first.output, options).output).toBe(first.output);
  });
});
