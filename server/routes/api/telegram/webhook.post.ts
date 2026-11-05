import { defineHandler } from "nitro";
import { configured, getEnv, json, safeEqual, sha256Hex, tg, webhookSecret, type TgEnv } from "../../../utils/tg";

const HELP =
  "Я присылаю напоминания из приложения «Форма».\n\nЧтобы подключить: откройте «Форму» → Профиль → Telegram → «Подключить бота».\nОтключить: /stop";

type Update = { message?: { text?: unknown; chat?: { id?: unknown; type?: unknown }; from?: { username?: unknown } } };

async function reply(env: TgEnv, chatId: number, text: string) {
  await tg(env, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

export default defineHandler(async (event) => {
  const env = getEnv();
  if (!configured(env)) return json({ error: "off" }, 503);
  const given = event.req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(given, await webhookSecret(env.TELEGRAM_BOT_TOKEN))) return json({ error: "forbidden" }, 401);

  const update = (await event.req.json().catch(() => null)) as Update | null;
  const message = update?.message;
  const chatId = message?.chat?.id;
  // Только личные чаты и только текст. Telegram всегда получает 200, иначе будет повторять запрос.
  if (!message || message.chat?.type !== "private" || typeof chatId !== "number" || typeof message.text !== "string") return json({ ok: true });

  const [rawCommand, arg = ""] = message.text.trim().split(/\s+/, 2);
  const command = rawCommand.split("@")[0].toLowerCase();
  try {
    if (command === "/start" && arg && arg.length <= 64) {
      const now = Date.now();
      const row = await env.DB.prepare(
        "UPDATE tg_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING device_hash",
      )
        .bind(now, await sha256Hex(arg), now)
        .first<{ device_hash: string }>();
      if (!row) {
        await reply(env, chatId, "Ссылка не сработала или устарела. Откройте «Форму» → Профиль → Telegram и нажмите «Подключить бота» заново.");
        return json({ ok: true });
      }
      const username = typeof message.from?.username === "string" ? message.from.username : null;
      await env.DB.prepare("DELETE FROM tg_links WHERE chat_id = ? AND device_hash <> ?").bind(chatId, row.device_hash).run();
      await env.DB.prepare(
        "INSERT INTO tg_links (device_hash, chat_id, tg_username, linked_at) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(device_hash) DO UPDATE SET chat_id = excluded.chat_id, tg_username = excluded.tg_username, linked_at = excluded.linked_at, fail_count = 0, disabled_at = NULL",
      )
        .bind(row.device_hash, chatId, username, now)
        .run();
      await reply(env, chatId, "Готово! Теперь напоминания «Формы» будут приходить сюда.\n\nВремя и вода настраиваются в приложении: Профиль → Telegram.\nОтключить: /stop");
    } else if (command === "/stop") {
      await env.DB.prepare("DELETE FROM tg_links WHERE chat_id = ?").bind(chatId).run();
      await reply(env, chatId, "Напоминания отключены. Чтобы вернуть, подключите бота в приложении заново.");
    } else {
      await reply(env, chatId, HELP);
    }
  } catch {
    // Сбой базы не должен вызывать бесконечные повторы от Telegram.
  }
  return json({ ok: true });
});
