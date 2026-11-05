import { defineHandler } from "nitro";
import { botUsername, configured, deviceHash, getEnv, json, randomToken, sha256Hex } from "../../../utils/tg";

const TTL_MIN = 10;

export default defineHandler(async (event) => {
  const env = getEnv();
  const device = await deviceHash(event.req);
  if (!device) return json({ error: "device" }, 400);
  if (!configured(env)) return json({ error: "unavailable" }, 503);
  try {
    const now = Date.now();
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM tg_tokens WHERE device_hash = ? AND created_at > ?")
      .bind(device, now - 3_600_000)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= 10) return json({ error: "rate" }, 429);
    const name = await botUsername(env);
    if (!name) return json({ error: "bot" }, 503);
    await env.DB.prepare("DELETE FROM tg_tokens WHERE device_hash = ? AND (used_at IS NOT NULL OR expires_at < ?)").bind(device, now).run();
    const token = randomToken(18);
    await env.DB.prepare("INSERT INTO tg_tokens (token_hash, device_hash, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256Hex(token), device, now, now + TTL_MIN * 60_000)
      .run();
    return json({ url: `https://t.me/${name}?start=${token}`, expiresInMin: TTL_MIN });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
});
