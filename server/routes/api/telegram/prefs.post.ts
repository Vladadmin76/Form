import { defineHandler } from "nitro";
import { parsePrefs } from "../../../../src/lib/tg-schedule";
import { configured, deviceHash, getEnv, json } from "../../../utils/tg";

export default defineHandler(async (event) => {
  const env = getEnv();
  const device = await deviceHash(event.req);
  if (!device) return json({ error: "device" }, 400);
  if (!configured(env)) return json({ error: "unavailable" }, 503);
  const prefs = parsePrefs(await event.req.json().catch(() => null));
  if (!prefs) return json({ error: "prefs" }, 400);
  try {
    const res = await env.DB.prepare(
      "UPDATE tg_links SET tz = ?, water_on = ?, water_from = ?, water_to = ?, water_every = ?, meals_json = ? WHERE device_hash = ?",
    )
      .bind(prefs.tz, prefs.water.on ? 1 : 0, prefs.water.from, prefs.water.to, prefs.water.every, JSON.stringify(prefs.meals), device)
      .run();
    if (!res.meta?.changes) return json({ error: "not-linked" }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
});
