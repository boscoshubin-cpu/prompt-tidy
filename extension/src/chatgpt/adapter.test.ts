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

  it("ignores competing inputs outside a semantic ChatGPT composer form", () => {
    document.body.innerHTML = `
      <form data-type="settings">
        <div contenteditable="true" role="textbox" aria-label="Message">Unrelated editor</div>
      </form>
      <form data-type="composer"><textarea>ChatGPT draft</textarea></form>
      <form><textarea aria-label="Message">Unrelated textarea</textarea></form>`;

    const composer = chatGptAdapter.findComposer();

    expect(chatGptAdapter.readDraft(composer!)).toBe("ChatGPT draft");
  });

  it("falls back to a textarea inside the message form", () => {
    document.body.innerHTML = `
      <form data-type="composer"><textarea>Fallback draft</textarea></form>
      <textarea>unrelated</textarea>`;

    const composer = chatGptAdapter.findComposer();

    expect(composer?.tagName).toBe("TEXTAREA");
    expect(chatGptAdapter.readDraft(composer!)).toBe("Fallback draft");
  });

  it("reads breaks, paragraphs, and nested block nodes deterministically", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div contenteditable="true" role="textbox">
          <section><p>First paragraph<br>Second line</p><div>Third paragraph</div></section>
          <p>Fourth paragraph</p>
        </div>
      </form>`;

    const composer = chatGptAdapter.findComposer();

    expect(chatGptAdapter.readDraft(composer!)).toBe(
      "First paragraph\nSecond line\nThird paragraph\nFourth paragraph"
    );
  });

  it("replaces a contenteditable draft with typed input events and focuses it", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div id="composer" contenteditable="true" role="textbox">Original draft</div>
      </form>`;
    const composer = document.querySelector<HTMLElement>("#composer")!;
    const events: Array<{
      bubbles: boolean;
      cancelable: boolean;
      data: string | null | undefined;
      inputType: string | undefined;
      type: string;
    }> = [];
    let draftAtBeforeInput = "";

    for (const type of ["beforeinput", "input", "change"]) {
      document.body.addEventListener(type, (event) => {
        if (event.type === "beforeinput") {
          draftAtBeforeInput = chatGptAdapter.readDraft(composer);
        }
        const inputEvent = event as InputEvent;
        events.push({
          bubbles: event.bubbles,
          cancelable: event.cancelable,
          data: inputEvent.data,
          inputType: inputEvent.inputType,
          type: event.type
        });
      });
    }

    chatGptAdapter.replaceDraft(composer, "Tidied draft");

    expect(composer.textContent).toBe("Tidied draft");
    expect(draftAtBeforeInput).toBe("Original draft");
    expect(events).toEqual([
      {
        bubbles: true,
        cancelable: true,
        data: "Tidied draft",
        inputType: "insertText",
        type: "beforeinput"
      },
      {
        bubbles: true,
        cancelable: false,
        data: "Tidied draft",
        inputType: "insertText",
        type: "input"
      },
      { bubbles: true, cancelable: false, data: undefined, inputType: undefined, type: "change" }
    ]);
    expect(document.activeElement).toBe(composer);
  });

  it("does not replace a draft when beforeinput is cancelled", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div id="composer" contenteditable="true" role="textbox">Original draft</div>
      </form>`;
    const composer = document.querySelector<HTMLElement>("#composer")!;
    const events: string[] = [];

    composer.addEventListener("beforeinput", (event) => {
      events.push(event.type);
      event.preventDefault();
    });
    composer.addEventListener("input", (event) => events.push(event.type));
    composer.addEventListener("change", (event) => events.push(event.type));

    expect(() => chatGptAdapter.replaceDraft(composer, "Tidied draft")).toThrow(ReplacementError);
    expect(chatGptAdapter.readDraft(composer)).toBe("Original draft");
    expect(events).toEqual(["beforeinput"]);
  });

  it("verifies multiline contenteditable replacement with the same DOM-to-text reader", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div id="composer" contenteditable="true" role="textbox">Original draft</div>
      </form>`;
    const composer = document.querySelector<HTMLElement>("#composer")!;

    chatGptAdapter.replaceDraft(composer, "First line\nSecond line");

    expect(chatGptAdapter.readDraft(composer)).toBe("First line\nSecond line");
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

  it("uses only a group with a composer submit control as a mount point", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div contenteditable="true" role="textbox">Draft</div>
        <div role="group"><button type="button">Emoji</button></div>
        <div id="composer-controls" role="group"><button type="submit">Send</button></div>
      </form>`;
    const composer = chatGptAdapter.findComposer()!;

    const mountPoint = chatGptAdapter.findMountPoint(composer);

    expect(mountPoint?.id).toBe("composer-controls");
    expect(composer.contains(mountPoint)).toBe(false);
  });

  it("returns null when a composer has no narrow safe mount point", () => {
    document.body.innerHTML = `
      <form data-type="composer">
        <div contenteditable="true" role="textbox">Draft</div>
        <div role="group"><button type="button">Emoji</button></div>
      </form>`;
    const composer = chatGptAdapter.findComposer()!;

    expect(chatGptAdapter.findMountPoint(composer)).toBeNull();
  });
});
