let csrf = "";
export function setCSRF(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    signal,
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response
    .json()
    .catch(() => ({ error: "服务暂不可用，请稍后重试" }));
  if (!response.ok) {
    if (response.status === 401 && path !== "login/")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(result.error || "操作失败", response.status);
  }
  return result;
}
export function localDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return localDate(date);
}
export function weekStart(value: string) {
  const day = new Date(`${value}T12:00:00+08:00`).getUTCDay();
  return shiftDate(value, -(day + 6) % 7);
}
export function formatTime(value: string | null, withTime = false) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value.includes("T") ? value : `${value}T12:00:00+08:00`));
}
export function datetimeInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return parts.replace(" ", "T");
}
