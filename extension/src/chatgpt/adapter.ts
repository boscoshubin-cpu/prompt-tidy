const COMPOSER_SELECTORS = [
  '[data-type="composer"] [contenteditable="true"][role="textbox"]',
  '[data-type="composer"] textarea',
  '[data-testid="conversation-compose"] [contenteditable="true"][role="textbox"]',
  '[data-testid="conversation-compose"] textarea',
  '#prompt-textarea[contenteditable="true"]',
  'textarea#prompt-textarea',
  'form [contenteditable="true"][role="textbox"][aria-label*="chatgpt" i]',
  'form [contenteditable="true"][role="textbox"][data-placeholder*="chatgpt" i]',
  'form textarea[aria-label*="chatgpt" i]',
  'form textarea[placeholder*="chatgpt" i]'
] as const;

const STABLE_CONTROL_CONTAINER_SELECTORS = [
  '[data-testid="composer-footer"]',
  '[data-testid="composer-actions"]'
] as const;

const RELEVANT_COMPOSER_CONTROL_SELECTOR = [
  'button[type="submit"]',
  'button[data-testid*="send" i]',
  '[role="button"][aria-label*="send" i]'
].join(", ");

const BLOCK_TAG_NAMES = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL"
]);

export interface ComposerAdapter {
  findComposer(root?: ParentNode): HTMLElement | null;
  readDraft(composer: HTMLElement): string;
  replaceDraft(composer: HTMLElement, text: string): void;
  findMountPoint(composer: HTMLElement): HTMLElement | null;
}

export class ReplacementError extends Error {
  constructor(message = "Could not verify that the ChatGPT draft was replaced.") {
    super(message);
    this.name = "ReplacementError";
  }
}

function isTextarea(composer: HTMLElement): composer is HTMLTextAreaElement {
  return composer instanceof HTMLTextAreaElement;
}

function isBlockNode(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && BLOCK_TAG_NAMES.has(node.tagName);
}

function isFormattingWhitespace(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE || !/^\s+$/u.test(node.textContent ?? "")) {
    return false;
  }

  return isBlockNode(node.previousSibling) || isBlockNode(node.nextSibling);
}

function hasFollowingContent(nodes: Node[], index: number): boolean {
  return nodes.slice(index + 1).some((node) => !isFormattingWhitespace(node));
}

function domToText(root: HTMLElement): string {
  let text = "";

  const appendBreak = (force = false): void => {
    if (force || !text.endsWith("\n")) {
      text += "\n";
    }
  };

  const visitChildren = (parent: Node): void => {
    const children = Array.from(parent.childNodes);

    for (const [index, child] of children.entries()) {
      if (isFormattingWhitespace(child)) {
        continue;
      }

      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? "";
      } else if (child instanceof HTMLElement && child.tagName === "BR") {
        appendBreak(true);
      } else {
        visitChildren(child);
      }

      if (isBlockNode(child) && hasFollowingContent(children, index)) {
        appendBreak();
      }
    }
  };

  visitChildren(root);
  return text;
}

function readComposerDraft(composer: HTMLElement): string {
  return isTextarea(composer) ? composer.value : domToText(composer);
}

function createInputEvent(type: "beforeinput" | "input", text: string, cancelable: boolean): InputEvent {
  const init: InputEventInit = {
    bubbles: true,
    cancelable,
    data: text,
    inputType: "insertText"
  };

  if (typeof InputEvent === "function") {
    return new InputEvent(type, init);
  }

  const event = new Event(type, init) as InputEvent;
  Object.defineProperties(event, {
    data: { value: text },
    inputType: { value: "insertText" }
  });
  return event;
}

function isOutsideEditable(candidate: HTMLElement, composer: HTMLElement): boolean {
  return candidate !== composer && !composer.contains(candidate);
}

function hasRelevantComposerControl(container: HTMLElement): boolean {
  return container.querySelector(RELEVANT_COMPOSER_CONTROL_SELECTOR) !== null;
}

export const chatGptAdapter: ComposerAdapter = {
  findComposer(root = document): HTMLElement | null {
    for (const selector of COMPOSER_SELECTORS) {
      const composer = root.querySelector<HTMLElement>(selector);
      if (composer) {
        return composer;
      }
    }

    return null;
  },

  readDraft(composer): string {
    return readComposerDraft(composer);
  },

  replaceDraft(composer, text): void {
    const beforeInput = createInputEvent("beforeinput", text, true);
    if (!composer.dispatchEvent(beforeInput)) {
      throw new ReplacementError("ChatGPT rejected the draft replacement.");
    }

    if (isTextarea(composer)) {
      composer.value = text;
    } else {
      composer.textContent = text;
    }

    composer.dispatchEvent(createInputEvent("input", text, false));
    composer.dispatchEvent(new Event("change", { bubbles: true }));

    if (readComposerDraft(composer) !== text) {
      throw new ReplacementError();
    }

    composer.focus();
  },

  findMountPoint(composer): HTMLElement | null {
    const form = composer.closest("form");
    if (!form) {
      return null;
    }

    for (const selector of STABLE_CONTROL_CONTAINER_SELECTORS) {
      for (const container of form.querySelectorAll<HTMLElement>(selector)) {
        if (isOutsideEditable(container, composer)) {
          return container;
        }
      }
    }

    for (const container of form.querySelectorAll<HTMLElement>('[role="group"]')) {
      if (isOutsideEditable(container, composer) && hasRelevantComposerControl(container)) {
        return container;
      }
    }

    const relevantControl = form.querySelector<HTMLElement>(RELEVANT_COMPOSER_CONTROL_SELECTOR);
    const mountPoint = relevantControl?.parentElement;
    if (mountPoint && isOutsideEditable(mountPoint, composer)) {
      return mountPoint;
    }

    return null;
  }
};
