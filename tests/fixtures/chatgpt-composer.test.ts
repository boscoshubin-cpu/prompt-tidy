import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

interface FixtureWindow extends Window {
  __promptTidyFixtureEvents: { sendClicks: number };
}

describe("ChatGPT composer fixture", () => {
  it("counts actual Send clicks but not form submissions", async () => {
    const html = await readFile(resolve("tests/fixtures/chatgpt-composer.html"), "utf8");
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "http://127.0.0.1:4173/chatgpt-composer.html",
      beforeParse(window) {
        Object.defineProperty(window, "fetch", {
          configurable: true,
          value: vi.fn().mockResolvedValue(new Response()),
          writable: true
        });
      }
    });
    const fixtureWindow = dom.window as unknown as FixtureWindow;
    const form = dom.window.document.querySelector<HTMLFormElement>("form")!;
    const send = dom.window.document.querySelector<HTMLButtonElement>("[data-testid='send-button']")!;

    const submitEvent = new dom.window.Event("submit", { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(submitEvent)).toBe(false);
    expect(fixtureWindow.__promptTidyFixtureEvents.sendClicks).toBe(0);

    send.click();
    expect(fixtureWindow.__promptTidyFixtureEvents.sendClicks).toBe(1);
    dom.window.close();
  });
});
