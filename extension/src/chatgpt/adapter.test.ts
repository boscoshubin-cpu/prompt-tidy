import { afterEach, describe, expect, it } from "vitest";

import { chatGptAdapter, ReplacementError } from "./adapter";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("chatGptAdapter", () => {
  it("finds the semantic message composer and reads its draft", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div contenteditable="true" role="textbox"><p>分析这个项目</p></div>
      </form>
      <div contenteditable="true">unrelated</div>`;

    const composer = chatGptAdapter.findComposer();

    expect(composer?.getAttribute("role")).toBe("textbox");
    expect(chatGptAdapter.readDraft(composer!)).toBe("分析这个项目");
  });

  it("falls back to a textarea inside the message form", () => {
    document.body.innerHTML = `
      <form data-type="composer"><textarea>Fallback draft</textarea></form>
      <textarea>unrelated</textarea>`;

    const composer = chatGptAdapter.findComposer();

    expect(composer?.tagName).toBe("TEXTAREA");
    expect(chatGptAdapter.readDraft(composer!)).toBe("Fallback draft");
  });

  it("preserves paragraphs when reading a contenteditable draft", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div contenteditable="true" role="textbox"><p>First paragraph</p><p>Second paragraph</p></div>
      </form>`;

    const composer = chatGptAdapter.findComposer();

    expect(chatGptAdapter.readDraft(composer!)).toBe("First paragraph\nSecond paragraph");
  });

  it("replaces a contenteditable draft, emits change events, and focuses it", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div id="composer" contenteditable="true" role="textbox">Original draft</div>
      </form>`;
    const composer = document.querySelector<HTMLElement>("#composer")!;
    const events: string[] = [];

    document.body.addEventListener("beforeinput", (event) => events.push(event.type));
    document.body.addEventListener("input", (event) => events.push(event.type));
    document.body.addEventListener("change", (event) => events.push(event.type));

    chatGptAdapter.replaceDraft(composer, "Tidied draft");

    expect(composer.textContent).toBe("Tidied draft");
    expect(events).toEqual(["beforeinput", "input", "change"]);
    expect(document.activeElement).toBe(composer);
  });

  it("throws when a textarea write cannot be verified", () => {
    document.body.innerHTML = `
      <form data-type="composer"><textarea id="composer">Original draft</textarea></form>`;
    const composer = document.querySelector<HTMLTextAreaElement>("#composer")!;

    Object.defineProperty(composer, "value", {
      configurable: true,
      get: () => "Original draft",
      set: () => undefined
    });

    expect(() => chatGptAdapter.replaceDraft(composer, "Tidied draft")).toThrow(ReplacementError);
  });

  it("returns a composer control container outside the editable region", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div contenteditable="true" role="textbox">Draft</div>
        <div id="composer-controls" role="group"><button type="submit">Send</button></div>
      </form>`;
    const composer = chatGptAdapter.findComposer()!;

    const mountPoint = chatGptAdapter.findMountPoint(composer);

    expect(mountPoint?.id).toBe("composer-controls");
    expect(composer.contains(mountPoint)).toBe(false);
  });
});
