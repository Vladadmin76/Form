import { defineHandler } from "nitro";
import { configured, deviceHash, getEnv, json, tg } from "../../../utils/tg";

export default defineHandler(async (event) => {
  const env = getEnv();
  const device = await deviceHash(event.req);
  if (!device) return json({ error: "device" }, 400);
  if (!configured(env)) return json({ error: "unavailable" }, 503);
  try {
    const row = await env.DB.prepare("SELECT chat_id FROM tg_links WHERE device_hash = ?").bind(device).first<{ chat_id: number }>();
    if (!row) return json({ error: "not-linked" }, 404);
    const res = await tg(env, "sendMessage", { chat_id: row.chat_id, text: "✅ Проверка: напоминания «Формы» приходят сюда." });
    return res.ok ? json({ ok: true }) : json({ error: "send" }, 502);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
});
