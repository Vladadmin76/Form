// Клиент Telegram-напоминаний. Секрет устройства создаётся один раз и хранится только в этом браузере;
// на сервер уходит в заголовке, там остаётся только его хеш.
import type { TgPrefs } from "@/lib/tg-schedule";

const KEY = "forma-device";
let memory = "";

export function deviceSecret(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[A-Za-z0-9_-]{32,128}$/.test(saved)) return saved;
  } catch {
    // Хранилище недоступно: секрет будет жить до закрытия страницы.
  }
  if (!memory) memory = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    // см. выше
  }
  return memory;
}

export type TgStatus = {
  available: boolean;
  connected?: boolean;
  disabled?: boolean;
  username?: string | null;
  prefs?: TgPrefs;
};

type Reply<T> = { ok: boolean; status: number; data: T | null };

async function call<T>(path: string, body?: unknown): Promise<Reply<T>> {
  try {
    const res = await fetch(`/api/telegram/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-forma-device": deviceSecret() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export const tgStatus = () => call<TgStatus>("status");
export const tgLink = () => call<{ url: string; expiresInMin: number }>("link", {});
export const tgSavePrefs = (prefs: TgPrefs) => call<{ ok: boolean }>("prefs", prefs);
export const tgTest = () => call<{ ok: boolean }>("test", {});
export const tgUnlink = () => call<{ ok: boolean }>("unlink", {});
export type WaterEvent = { id: number; day: string; ml: number };
export const tgWater = (body: { day: string; ml: number; goal: number; ack: number[] }) => call<{ events: WaterEvent[] }>("water", body);

// Признак «этот телефон подключён к боту» нужен, чтобы приложение само забирало воду из бота, не спрашивая сервер зря.
const LINKED = "forma-tg-linked";
export function setLinked(on: boolean) {
  try {
    if (on) localStorage.setItem(LINKED, "1");
    else localStorage.removeItem(LINKED);
  } catch {
    // Хранилище недоступно.
  }
}
export function isLinked(): boolean {
  try {
    return localStorage.getItem(LINKED) === "1";
  } catch {
    return false;
  }
}

export const toTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const fromTime = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};
