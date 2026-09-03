import { expect, test } from "./test-extension";

const fixtureUrl = "http://127.0.0.1:4173/chatgpt-composer.html";
const chineseSample = "帮我分析这个项目。背景是给新手使用。面向大学生。必须用通俗语言。请用表格输出。";
const structuredResult = [
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
].join("\n");

test("tidies a draft in the packaged extension without sending it", async ({ page }) => {
  await page.goto(fixtureUrl);
  const composer = page.getByRole("textbox", { name: "Message ChatGPT" });
  await composer.fill(chineseSample);

  await page.getByRole("button", { name: "整理" }).click();
  const preview = page.getByRole("dialog", { name: "整理预览" });
  await preview.getByRole("radio", { name: "Structured" }).check();
  await expect(preview.getByRole("region", { name: "整理结果" }).locator("pre")).toHaveText(structuredResult);

  await preview.getByRole("button", { name: "替换到输入框" }).click();
  await expect(composer).toHaveText(structuredResult);
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __promptTidyFixtureEvents: { sendClicks: number } }
  ).__promptTidyFixtureEvents.sendClicks)).toBe(0);
});

test("remounts exactly once when the composer node is replaced", async ({ page }) => {
  await page.goto(fixtureUrl);
  await expect(page.locator("[data-prompt-tidy-root='true']")).toHaveCount(1);

  await page.getByRole("button", { name: "Replace composer" }).click();

  await expect(page.locator("[data-prompt-tidy-root='true']")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "整理" })).toHaveCount(1);
});

test("remounts exactly once when only the composer footer is replaced", async ({ page }) => {
  await page.goto(fixtureUrl);
  const composer = page.getByRole("textbox", { name: "Message ChatGPT" });
  await expect(page.locator("[data-prompt-tidy-root='true']")).toHaveCount(1);

  await page.getByRole("button", { name: "Replace footer" }).click();

  await expect(composer).toHaveCount(1);
  await expect(page.locator("[data-prompt-tidy-root='true']")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "整理" })).toHaveCount(1);
});

test("disables tidying when the draft is empty", async ({ page }) => {
  await page.goto(fixtureUrl);
  await expect(page.getByRole("button", { name: "整理" })).toBeDisabled();
});

test("blocks replacement when the draft changed after preview", async ({ page }) => {
  await page.goto(fixtureUrl);
  const composer = page.getByRole("textbox", { name: "Message ChatGPT" });
  await composer.fill(chineseSample);
  await page.getByRole("button", { name: "整理" }).click();

  await composer.fill("这是一份后来修改过的输入。");
  await page.getByRole("button", { name: "替换到输入框" }).click();

  await expect(page.getByRole("alert")).toHaveText("输入内容已变化，请重新整理");
  await expect(composer).toHaveText("这是一份后来修改过的输入。");
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __promptTidyFixtureEvents: { sendClicks: number } }
  ).__promptTidyFixtureEvents.sendClicks)).toBe(0);
});
