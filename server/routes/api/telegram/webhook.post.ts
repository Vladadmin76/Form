import { defineHandler } from "nitro";
import { localParts } from "../../../../src/lib/tg-schedule";
import { parseWater } from "../../../../src/lib/tg-water";
import { configured, getEnv, json, mlText, safeEqual, sha256Hex, tg, waterLine, waterToday, webhookSecret, type TgEnv, type D1 } from "../../../utils/tg";

const HELP =
  "Я присылаю напоминания из приложения «Форма» и записываю воду.\n\nПишите, сколько выпили: «выпил», «2 стакана», «400 мл», «полстакана».\nОтменить последнюю запись: /undo\nОтключить напоминания: /stop\n\nЧтобы подключить: «Форма» → Профиль → Telegram → «Подключить бота».";

type Message = { text?: unknown; chat?: { id?: unknown; type?: unknown }; from?: { username?: unknown } };
type Callback = { id?: unknown; data?: unknown; message?: { message_id?: unknown; chat?: { id?: unknown; type?: unknown } } };
type Update = { message?: Message; callback_query?: Callback };
type Db = TgEnv & { DB: D1; TELEGRAM_BOT_TOKEN: string };

async function reply(env: TgEnv, chatId: number, text: string) {
  await tg(env, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

/** Записывает воду от бота. Возвращает текст ответа. */
async function recordWater(env: Db, chatId: number, ml: number): Promise<string> {
  const link = await env.DB.prepare("SELECT device_hash, tz FROM tg_links WHERE chat_id = ?").bind(chatId).first<{ device_hash: string; tz: string }>();
  if (!link) return "Чат не подключён к «Форме». Откройте приложение: Профиль → Telegram → «Подключить бота».";
  const now = Date.now();
  const day = localParts(now, link.tz).day;
  await env.DB.prepare("INSERT INTO tg_water (device_hash, day, ml, created_at, claimed) VALUES (?, ?, ?, ?, 0)").bind(link.device_hash, day, ml, now).run();
  // Человек пишет боту, значит доставка работает: снимаем остановку отправки.
  await env.DB.prepare("UPDATE tg_links SET disabled_at = NULL, fail_count = 0 WHERE chat_id = ?").bind(chatId).run();
  const { total, goal } = await waterToday(env, link.device_hash, day);
  return `💧 Записал +${mlText(ml)}.${waterLine(total, goal)}`;
}

async function undoWater(env: Db, chatId: number): Promise<string> {
  const link = await env.DB.prepare("SELECT device_hash FROM tg_links WHERE chat_id = ?").bind(chatId).first<{ device_hash: string }>();
  if (!link) return "Чат не подключён к «Форме».";
  const last = await env.DB.prepare("SELECT id, ml FROM tg_water WHERE device_hash = ? AND claimed = 0 ORDER BY id DESC LIMIT 1")
    .bind(link.device_hash)
    .first<{ id: number; ml: number }>();
  if (!last) return "Отменять нечего: последнюю запись приложение уже забрало. Уберите воду в приложении (нажмите на полный стакан).";
  await env.DB.prepare("DELETE FROM tg_water WHERE id = ?").bind(last.id).run();
  return `↩️ Отменил запись: ${mlText(last.ml)}.`;
}

export default defineHandler(async (event) => {
  const env = getEnv();
  if (!configured(env)) return json({ error: "off" }, 503);
  const given = event.req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(given, await webhookSecret(env.TELEGRAM_BOT_TOKEN))) return json({ error: "forbidden" }, 401);

  const update = (await event.req.json().catch(() => null)) as Update | null;
  try {
    // Нажатие кнопки под напоминанием: «1 стакан» / «2 стакана».
    const cb = update?.callback_query;
    if (cb) {
      const chat = cb.message?.chat;
      const chatId = chat?.id;
      const messageId = cb.message?.message_id;
      const data = typeof cb.data === "string" ? cb.data : "";
      const ml = data === "w:200" ? 200 : data === "w:400" ? 400 : 0;
      if (chat?.type === "private" && typeof chatId === "number" && typeof messageId === "number" && ml > 0) {
        const text = await recordWater(env, chatId, ml);
        await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: `+${ml} мл записано` });
        await tg(env, "editMessageText", { chat_id: chatId, message_id: messageId, text });
      } else if (cb.id) {
        await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
      }
      return json({ ok: true });
    }

    const message = update?.message;
    const chatId = message?.chat?.id;
    // Только личные чаты и только текст. Telegram всегда получает 200, иначе будет повторять запрос.
    if (!message || message.chat?.type !== "private" || typeof chatId !== "number" || typeof message.text !== "string") return json({ ok: true });

    const text = message.text.trim();
    const [rawCommand, arg = ""] = text.split(/\s+/, 2);
    const command = rawCommand.split("@")[0].toLowerCase();
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
      await reply(env, chatId, "Готово! Теперь напоминания «Формы» будут приходить сюда.\n\nВремя и вода настраиваются в приложении: Профиль → Telegram.\nПишите мне, сколько выпили воды: «выпил», «2 стакана», «400 мл».\nОтключить: /stop");
    } else if (command === "/stop") {
      await env.DB.prepare("DELETE FROM tg_links WHERE chat_id = ?").bind(chatId).run();
      await reply(env, chatId, "Напоминания отключены. Чтобы вернуть, подключите бота в приложении заново.");
    } else if (command === "/undo" || /^(отмена|отменить|undo)[.!]?$/i.test(text)) {
      await reply(env, chatId, await undoWater(env, chatId));
    } else if (command === "/help" || command === "/start") {
      await reply(env, chatId, HELP);
    } else {
      const water = parseWater(text);
      if (water && "ml" in water) await reply(env, chatId, await recordWater(env, chatId, water.ml));
      else if (water) await reply(env, chatId, "За один раз можно записать от 50 до 2000 мл. Напишите, например: «выпил», «2 стакана» или «400 мл».");
      else await reply(env, chatId, HELP);
    }
  } catch {
    // Сбой базы не должен вызывать бесконечные повторы от Telegram.
  }
  return json({ ok: true });
});
