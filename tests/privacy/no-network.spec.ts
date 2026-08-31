import { expect, test } from "../e2e/test-extension";

const fixtureUrl = "http://127.0.0.1:4173/chatgpt-composer.html";
const chineseSample = "帮我分析这个项目。背景是给新手使用。面向大学生。必须用通俗语言。请用表格输出。";
const postActionObservationMs = 1_000;

test("makes no application network calls while tidying", async ({ context, page }) => {
  const requestUrls: string[] = [];
  const webSocketUrls: string[] = [];
  context.on("request", (request) => requestUrls.push(request.url()));
  page.on("websocket", (socket) => webSocketUrls.push(socket.url()));
  await page.goto(fixtureUrl);

  const composer = page.getByRole("textbox", { name: "Message ChatGPT" });
  await composer.fill(chineseSample);
  await page.getByRole("button", { name: "整理" }).click();
  const preview = page.getByRole("dialog", { name: "整理预览" });
  await preview.getByRole("radio", { name: "Structured" }).check();
  await preview.getByRole("button", { name: "替换到输入框" }).click();
  await expect(preview).toHaveCount(0);
  await expect(composer).toContainText("## 任务");

  await page.waitForTimeout(postActionObservationMs);
  const fixtureEvents = await page.evaluate(() => (
    window as typeof window & { __promptTidyFixtureEvents: FixtureEvents }
  ).__promptTidyFixtureEvents);

  expect(fixtureEvents).toEqual({
    beaconCalls: [],
    fetchCalls: [],
    sendClicks: 0,
    xhrCalls: []
  });
  expect(requestUrls.filter(isUnexpectedApplicationNetworkUrl)).toEqual([]);
  expect(webSocketUrls.filter(isApplicationNetworkUrl)).toEqual([]);
});

function isUnexpectedApplicationNetworkUrl(url: string): boolean {
  return isApplicationNetworkUrl(url) && url !== fixtureUrl;
}

function isApplicationNetworkUrl(url: string): boolean {
  return /^(?:https?|wss?):\/\//u.test(url);
}

interface FixtureEvents {
  beaconCalls: unknown[];
  fetchCalls: unknown[];
  sendClicks: number;
  xhrCalls: unknown[];
}
