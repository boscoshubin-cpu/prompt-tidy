const COMPOSER_SELECTORS = [
  '[contenteditable="true"][role="textbox"][aria-label*="message" i]',
  'textarea[aria-label*="message" i]',
  '[data-type="composer"] [contenteditable="true"][role="textbox"]',
  '[data-type="composer"] textarea',
  'form [contenteditable="true"][role="textbox"]',
  'form textarea'
] as const;

const CONTROL_CONTAINER_SELECTORS = [
  '[data-testid="composer-footer"]',
  '[data-testid="composer-actions"]',
  '[role="group"]'
] as const;

export interface ComposerAdapter {
  findComposer(root?: ParentNode): HTMLElement | null;
  readDraft(composer: HTMLElement): string;
  replaceDraft(composer: HTMLElement, text: string): void;
  findMountPoint(composer: HTMLElement): HTMLElement | null;
}

export class ReplacementError extends Error {
  constructor() {
    super("Could not verify that the ChatGPT draft was replaced.");
    this.name = "ReplacementError";
  }
}

function isTextarea(composer: HTMLElement): composer is HTMLTextAreaElement {
  return composer instanceof HTMLTextAreaElement;
}

function readContentEditable(composer: HTMLElement): string {
  if (typeof composer.innerText === "string") {
    return composer.innerText;
  }

  return Array.from(composer.childNodes, (node) => node.textContent ?? "").join("\n");
}

function dispatchComposerEvents(composer: HTMLElement): void {
  for (const type of ["beforeinput", "input", "change"]) {
    composer.dispatchEvent(new Event(type, { bubbles: true }));
  }
}

function isOutsideEditable(candidate: HTMLElement, composer: HTMLElement): boolean {
  return candidate !== composer && !composer.contains(candidate);
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
    if (isTextarea(composer)) {
      return composer.value;
    }

    return readContentEditable(composer);
  },

  replaceDraft(composer, text): void {
    if (isTextarea(composer)) {
      composer.value = text;
    } else {
      composer.textContent = text;
    }

    dispatchComposerEvents(composer);

    if (this.readDraft(composer) !== text) {
      throw new ReplacementError();
    }

    composer.focus();
  },

  findMountPoint(composer): HTMLElement | null {
    const form = composer.closest("form");
    if (!form) {
      return null;
    }

    for (const selector of CONTROL_CONTAINER_SELECTORS) {
      const container = form.querySelector<HTMLElement>(selector);
      if (container && isOutsideEditable(container, composer)) {
        return container;
      }
    }

    const submitControlParent = form.querySelector('button[type="submit"]')?.parentElement;
    if (submitControlParent && isOutsideEditable(submitControlParent, composer)) {
      return submitControlParent;
    }

    return form;
  }
};
