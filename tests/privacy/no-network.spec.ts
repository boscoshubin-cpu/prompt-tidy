import { expect, test } from "../e2e/test-extension";

const fixtureUrl = "http://127.0.0.1:4173/chatgpt-composer.html";
const chineseSample = "帮我分析这个项目。背景是给新手使用。面向大学生。必须用通俗语言。请用表格输出。";

test("makes no application network calls while tidying", async ({ context, page }) => {
  await page.goto(fixtureUrl);
  const requestUrls: string[] = [];
  const webSocketUrls: string[] = [];
  context.on("request", (request) => requestUrls.push(request.url()));
  page.on("websocket", (socket) => webSocketUrls.push(socket.url()));

  await page.getByRole("textbox", { name: "Message ChatGPT" }).fill(chineseSample);
  await page.getByRole("button", { name: "整理" }).click();
  await page.getByRole("dialog", { name: "整理预览" })
    .getByRole("radio", { name: "Structured" })
    .check();

  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __promptTidyFixtureEvents: FixtureEvents }
  ).__promptTidyFixtureEvents)).toEqual({
    beaconCalls: [],
    fetchCalls: [],
    sendClicks: 0,
    xhrCalls: []
  });
  expect(requestUrls.filter(isApplicationNetworkUrl)).toEqual([]);
  expect(webSocketUrls.filter(isApplicationNetworkUrl)).toEqual([]);
});

function isApplicationNetworkUrl(url: string): boolean {
  return /^(?:https?|wss?):\/\//u.test(url);
}

interface FixtureEvents {
  beaconCalls: unknown[];
  fetchCalls: unknown[];
  sendClicks: number;
  xhrCalls: unknown[];
}
