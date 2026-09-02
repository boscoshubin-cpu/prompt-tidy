import { describe, expect, it } from "vitest";

import { normalizeText } from "./normalize";

describe("normalizeText", () => {
  it("preserves list continuation indentation while normalizing surrounding whitespace", () => {
    const input = [
      "  Standalone   paragraph  ",
      "- Parent   item",
      "  continuation   text  ",
      "    1. Nested   item",
      "       nested   continuation  ",
      "After   list"
    ].join("\n");

    expect(normalizeText(input)).toEqual({
      text: [
        "Standalone paragraph",
        "- Parent item",
        "  continuation text",
        "    1. Nested item",
        "       nested continuation",
        "After list"
      ].join("\n"),
      changes: [{ kind: "normalized", description: "Normalized whitespace and paragraph breaks." }]
    });
  });
});
