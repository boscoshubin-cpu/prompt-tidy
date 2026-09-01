export interface CompatibilityStatus {
  state: "supported" | "unsupported" | "unknown";
  adapterVersion: "1";
  checkedAt: string;
  errorCategory?: "composer_not_found" | "mount_not_found" | "replacement_failed";
}

interface LocalStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCompatibilityStatus(value: unknown): CompatibilityStatus | undefined {
  if (!isRecord(value)) return undefined;

  const { state, adapterVersion, checkedAt, errorCategory } = value;
  if (
    (state !== "supported" && state !== "unsupported" && state !== "unknown")
    || adapterVersion !== "1"
    || typeof checkedAt !== "string"
    || (
      errorCategory !== undefined
      && errorCategory !== "composer_not_found"
      && errorCategory !== "mount_not_found"
      && errorCategory !== "replacement_failed"
    )
  ) {
    return undefined;
  }

  return { state, adapterVersion, checkedAt, ...(errorCategory ? { errorCategory } : {}) };
}

function stateMessage(status?: CompatibilityStatus): string {
  const lastKnown = (message: string): string => `最近一次检测：${message}`;

  if (status?.state === "supported") return lastKnown("ChatGPT 输入框已识别");
  if (status?.state === "unsupported" && status.errorCategory === "mount_not_found") {
    return lastKnown("已找到输入框，但整理按钮无法挂载");
  }
  if (status?.state === "unsupported" && status.errorCategory === "replacement_failed") {
    return lastKnown("上次替换失败，请返回页面重试");
  }
  if (status?.state === "unsupported" && status.errorCategory === "composer_not_found") {
    return lastKnown("当前页面未找到 ChatGPT 输入框");
  }
  if (status?.state === "unsupported") return lastKnown("当前页面暂不受支持");
  return "尚未检测 ChatGPT 输入框";
}

async function renderPopup(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;

  const storage = chrome.storage.local as unknown as LocalStorageArea;
  let status: CompatibilityStatus | undefined;

  try {
    const saved = await storage.get("compatibilityStatus");
    status = readCompatibilityStatus(saved.compatibilityStatus);
  } catch {
    status = undefined;
  }

  const title = document.createElement("h1");
  title.textContent = "Prompt Tidy";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  message.textContent = stateMessage(status);
  const metadata = document.createElement("p");
  metadata.className = "prompt-tidy-popup-meta";
  metadata.textContent = status ? `适配器版本 ${status.adapterVersion}` : "请打开 ChatGPT 后重试";
  root.replaceChildren(title, message, metadata);
}

void renderPopup();
