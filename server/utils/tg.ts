// Общие помощники Telegram-напоминаний (серверная часть, Cloudflare Workers + D1).

export type Stmt = {
  bind: (...values: unknown[]) => Stmt;
  run: () => Promise<{ meta?: { changes?: number } }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
};
export type D1 = { prepare: (sql: string) => Stmt };
export type TgEnv = { DB?: D1; TELEGRAM_BOT_TOKEN?: string; TELEGRAM_API_BASE?: string };
export type TgApiResult = { ok: boolean; result?: unknown; error_code?: number; description?: string };

/** Привязки Worker'а (база, секреты). Nitro кладёт их в globalThis.__env__ на каждый запрос и каждый cron. */
export function getEnv(): TgEnv {
  return (globalThis as { __env__?: TgEnv }).__env__ ?? {};
}

export function configured(env: TgEnv): env is TgEnv & { DB: D1; TELEGRAM_BOT_TOKEN: string } {
  return Boolean(env.DB && env.TELEGRAM_BOT_TOKEN);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 18): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Секрет вебхука выводится из токена бота: отдельно хранить не нужно. Тот же расчёт в scripts/telegram-setup.mjs. */
export function webhookSecret(token: string): Promise<string> {
  return sha256Hex(`tg-webhook:${token}`);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function tg(env: TgEnv, method: string, data: Record<string, unknown>): Promise<TgApiResult> {
  const base = env.TELEGRAM_API_BASE || "https://api.telegram.org";
  try {
    const res = await fetch(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    });
    return (await res.json()) as TgApiResult;
  } catch {
    return { ok: false, description: "network" };
  }
}

let cachedName: { name: string; until: number } | null = null;

/** Имя бота (@username) берём у Telegram и помним час. */
export async function botUsername(env: TgEnv): Promise<string | null> {
  if (cachedName && cachedName.until > Date.now()) return cachedName.name;
  const res = await tg(env, "getMe", {});
  const name = (res.result as { username?: string } | undefined)?.username;
  if (!res.ok || !name) return null;
  cachedName = { name, until: Date.now() + 3_600_000 };
  return name;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Секрет устройства приходит в заголовке; на сервере хранится только его хеш. */
export async function deviceHash(req: { headers: Headers }): Promise<string | null> {
  const secret = req.headers.get("x-forma-device") ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return null;
  return sha256Hex(`forma-device:${secret}`);
}

export const GLASS_KEYBOARD = {
  inline_keyboard: [[{ text: "1 стакан (200 мл)", callback_data: "w:200" }, { text: "2 стакана", callback_data: "w:400" }]],
};

const mlText = (ml: number) => `${String(Math.round(ml)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} мл`;

/** Сколько воды сегодня: последнее, что сообщило приложение, плюс записи из бота, которые приложение ещё не забрало. */
export async function waterToday(env: TgEnv & { DB: D1 }, device: string, day: string): Promise<{ total: number; goal: number }> {
  const state = await env.DB.prepare("SELECT day, ml, goal FROM tg_water_state WHERE device_hash = ?")
    .bind(device)
    .first<{ day: string; ml: number; goal: number }>();
  const extra = await env.DB.prepare("SELECT COALESCE(SUM(ml), 0) AS ml FROM tg_water WHERE device_hash = ? AND day = ? AND claimed = 0")
    .bind(device, day)
    .first<{ ml: number }>();
  return { total: (state && state.day === day ? state.ml : 0) + (extra?.ml ?? 0), goal: state?.goal ?? 0 };
}

export function waterLine(total: number, goal: number): string {
  if (goal <= 0) return "";
  return total >= goal ? ` Сегодня ${mlText(total)} из ${mlText(goal)}. Цель выполнена!` : ` Сегодня ${mlText(total)} из ${mlText(goal)}.`;
}

export { mlText };
