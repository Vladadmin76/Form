import { defineHandler } from "nitro";
import { configured, deviceHash, getEnv, json } from "../../../utils/tg";

export default defineHandler(async (event) => {
  const env = getEnv();
  const device = await deviceHash(event.req);
  if (!device) return json({ error: "device" }, 400);
  if (!configured(env)) return json({ error: "unavailable" }, 503);
  try {
    await env.DB.prepare("DELETE FROM tg_links WHERE device_hash = ?").bind(device).run();
    await env.DB.prepare("DELETE FROM tg_tokens WHERE device_hash = ?").bind(device).run();
    return json({ ok: true });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
});
