import { defineTask } from "nitro/task";
import { dueReminders, nextSent, type TgMeal, type TgPrefs } from "../../../src/lib/tg-schedule";
import { configured, getEnv, tg } from "../../utils/tg";

type Row = {
  device_hash: string;
  chat_id: number;
  tz: string;
  water_on: number;
  water_from: number;
  water_to: number;
  water_every: number;
  meals_json: string;
  sent_json: string;
  fail_count: number;
};

// Бесплатный тариф: 50 обращений к сети на один запуск, берём с запасом.
const MAX_MESSAGES = 30;

export default defineTask({
  meta: { name: "reminders:send", description: "Напоминания в Telegram по расписанию" },
  async run() {
    const env = getEnv();
    if (!configured(env)) return { result: "skipped" };
    const now = Date.now();
    const { results } = await env.DB.prepare(
      "SELECT device_hash, chat_id, tz, water_on, water_from, water_to, water_every, meals_json, sent_json, fail_count " +
        "FROM tg_links WHERE disabled_at IS NULL AND (water_on = 1 OR meals_json <> '[]') LIMIT 100",
    ).all<Row>();

    let budget = MAX_MESSAGES;
    let sentTotal = 0;
    for (const row of results) {
      if (budget <= 0) break;
      let meals: TgMeal[] = [];
      let sent: string[] = [];
      try {
        meals = JSON.parse(row.meals_json) as TgMeal[];
        sent = JSON.parse(row.sent_json) as string[];
      } catch {
        // Битые данные считаем пустыми.
      }
      const prefs: TgPrefs = { tz: row.tz, water: { on: row.water_on === 1, from: row.water_from, to: row.water_to, every: row.water_every }, meals };
      const due = dueReminders(prefs, sent, now).slice(0, budget);
      if (due.length === 0) continue;

      const done: string[] = [];
      let failure: { code?: number; description?: string } | null = null;
      for (const item of due) {
        const res = await tg(env, "sendMessage", { chat_id: row.chat_id, text: item.text });
        budget -= 1;
        if (res.ok) {
          done.push(item.key);
          sentTotal += 1;
        } else {
          failure = { code: res.error_code, description: res.description };
          break;
        }
      }
      if (done.length > 0) {
        await env.DB.prepare("UPDATE tg_links SET sent_json = ?, fail_count = 0 WHERE device_hash = ?")
          .bind(JSON.stringify(nextSent(sent, done, now, row.tz)), row.device_hash)
          .run();
      }
      if (failure) {
        // 403: бота заблокировали, 400 «chat not found»: чата нет. Дальше пробовать бессмысленно.
        const gone = failure.code === 403 || (failure.code === 400 && /chat not found/i.test(failure.description ?? ""));
        const fails = row.fail_count + 1;
        await env.DB.prepare("UPDATE tg_links SET fail_count = ?, disabled_at = ? WHERE device_hash = ?")
          .bind(fails, gone || fails >= 5 ? now : null, row.device_hash)
          .run();
      }
    }
    return { result: `sent ${sentTotal}` };
  },
});
