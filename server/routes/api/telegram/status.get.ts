import { defineHandler } from "nitro";
import { configured, deviceHash, getEnv, json } from "../../../utils/tg";

export default defineHandler(async (event) => {
  const env = getEnv();
  const device = await deviceHash(event.req);
  if (!configured(env) || !device) return json({ available: false });
  try {
    const row = await env.DB.prepare(
      "SELECT tg_username, tz, water_on, water_from, water_to, water_every, meals_json, disabled_at FROM tg_links WHERE device_hash = ?",
    )
      .bind(device)
      .first<Record<string, unknown>>();
    if (!row) return json({ available: true, connected: false });
    return json({
      available: true,
      connected: true,
      disabled: Boolean(row.disabled_at),
      username: row.tg_username ?? null,
      prefs: {
        tz: row.tz,
        water: { on: row.water_on === 1, from: row.water_from, to: row.water_to, every: row.water_every },
        meals: JSON.parse(String(row.meals_json || "[]")),
      },
    });
  } catch {
    return json({ available: false });
  }
});
