import { defineHandler } from "nitro";
import { configured, deviceHash, getEnv, json } from "../../../utils/tg";

// Синхронизация воды с приложением: приложение сообщает «сегодня выпито / цель» и подтверждает забранные записи,
// сервер отдаёт записи, которые пришли из бота.
export default defineHandler(async (event) => {
  const env = getEnv();
  const device = await deviceHash(event.req);
  if (!device) return json({ error: "device" }, 400);
  if (!configured(env)) return json({ error: "unavailable" }, 503);
  const body = (await event.req.json().catch(() => null)) as { day?: unknown; ml?: unknown; goal?: unknown; ack?: unknown } | null;
  const ok =
    body &&
    typeof body.day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.day) &&
    typeof body.ml === "number" &&
    Number.isFinite(body.ml) &&
    body.ml >= 0 &&
    body.ml <= 20000 &&
    typeof body.goal === "number" &&
    body.goal >= 0 &&
    body.goal <= 20000 &&
    (body.ack === undefined || (Array.isArray(body.ack) && body.ack.length <= 50 && body.ack.every((id) => Number.isInteger(id))));
  if (!ok) return json({ error: "body" }, 400);
  const ack = (body.ack as number[] | undefined) ?? [];
  try {
    const link = await env.DB.prepare("SELECT 1 AS ok FROM tg_links WHERE device_hash = ?").bind(device).first();
    if (!link) return json({ error: "not-linked" }, 404);
    if (ack.length > 0) {
      await env.DB.prepare(`UPDATE tg_water SET claimed = 1 WHERE device_hash = ? AND id IN (${ack.map(() => "?").join(",")})`)
        .bind(device, ...ack)
        .run();
    }
    await env.DB.prepare(
      "INSERT INTO tg_water_state (device_hash, day, ml, goal) VALUES (?, ?, ?, ?) ON CONFLICT(device_hash) DO UPDATE SET day = excluded.day, ml = excluded.ml, goal = excluded.goal",
    )
      .bind(device, body.day, Math.round(body.ml as number), Math.round(body.goal as number))
      .run();
    const { results } = await env.DB.prepare("SELECT id, day, ml FROM tg_water WHERE device_hash = ? AND claimed = 0 ORDER BY id LIMIT 50")
      .bind(device)
      .all<{ id: number; day: string; ml: number }>();
    return json({ events: results });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
});
