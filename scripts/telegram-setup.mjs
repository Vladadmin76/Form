// Сообщает Telegram адрес вебхука и команды бота. Запускается после каждой выкладки.
// Нужны переменные: TELEGRAM_BOT_TOKEN, SITE_URL (адрес сайта без слеша в конце).
import crypto from "node:crypto";

const token = process.env.TELEGRAM_BOT_TOKEN;
const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
const base = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
if (!token || !site.startsWith("https://")) {
  console.log("Telegram: нужны TELEGRAM_BOT_TOKEN и SITE_URL (https), шаг пропущен");
  process.exit(0);
}
// Тот же расчёт, что в server/utils/tg.ts (webhookSecret).
const secret = crypto.createHash("sha256").update(`tg-webhook:${token}`).digest("hex");

async function tg(method, data) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${base}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(15000),
      });
      return await res.json();
    } catch (error) {
      if (attempt === 3) return { ok: false, description: `сеть: ${error?.message}`, network: true };
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

const me = await tg("getMe", {});
if (!me.ok) {
  if (me.network) {
    console.log(`::warning::Telegram недоступен (${me.description}), вебхук остаётся прежним`);
    process.exit(0);
  }
  console.error(`::error::Telegram отклонил токен: ${me.description}`);
  process.exit(1);
}
console.log(`Telegram: бот @${me.result.username}`);

const hook = await tg("setWebhook", { url: `${site}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message"], max_connections: 20 });
if (!hook.ok) {
  console.error(`::error::setWebhook: ${hook.description}`);
  process.exit(1);
}
await tg("setMyCommands", { commands: [{ command: "stop", description: "Отключить напоминания" }, { command: "help", description: "Как подключить" }] });
console.log(`Telegram: вебхук ${site}/api/telegram/webhook установлен`);
