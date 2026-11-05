// Расписание Telegram-напоминаний. Чистые функции без обращений к сети и базе:
// их используют и сервер (рассылка по cron), и тесты.

export type TgMeal = { id: string; label: string; minute: number };
export type TgWater = { on: boolean; from: number; to: number; every: number };
export type TgPrefs = { tz: string; water: TgWater; meals: TgMeal[] };

export const CRON_WINDOW_MIN = 15;

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length < 1 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isMinute(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1439;
}

/** Проверяет и нормализует настройки, пришедшие с телефона. null, если что-то не так. */
export function parsePrefs(input: unknown): TgPrefs | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  if (!validTimeZone(data.tz)) return null;
  const water = data.water as Record<string, unknown> | undefined;
  if (!water || typeof water.on !== "boolean") return null;
  const every = water.every;
  if (!isMinute(water.from) || !isMinute(water.to) || water.from > water.to) return null;
  if (typeof every !== "number" || !Number.isInteger(every) || every < 30 || every > 360) return null;
  if (!Array.isArray(data.meals) || data.meals.length > 12) return null;
  const meals: TgMeal[] = [];
  for (const raw of data.meals) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 40) : "";
    if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > 64 || !label || !isMinute(item.minute)) return null;
    meals.push({ id: item.id, label, minute: item.minute });
  }
  return { tz: data.tz, water: { on: water.on, from: water.from, to: water.to, every }, meals };
}

/** Местные дата (ГГГГ-ММ-ДД) и минуты от полуночи в часовом поясе tz. */
export function localParts(ms: number, tz: string): { day: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

const WATER_TEXTS = [
  "💧 Пора выпить воды.",
  "💧 Время для стакана воды.",
  "💧 Не забудьте про воду.",
  "💧 Стакан воды сейчас будет кстати.",
];

function pick(list: string[], seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
}

export type DueReminder = { key: string; text: string };

/**
 * Какие напоминания нужно отправить в окне (now - windowMin, now].
 * sent: ключи уже отправленных, чтобы не повторяться при сбое или повторном запуске.
 */
export function dueReminders(prefs: TgPrefs, sent: string[], nowMs: number, windowMin = CRON_WINDOW_MIN): DueReminder[] {
  const now = localParts(nowMs, prefs.tz);
  const before = localParts(nowMs - windowMin * 60_000, prefs.tz);
  // Окно может захватить полночь: тогда это два куска, конец прошлых суток и начало сегодняшних.
  const slices =
    before.day === now.day
      ? [{ day: now.day, after: before.minute, upTo: now.minute }]
      : [
          { day: before.day, after: before.minute, upTo: 1439 },
          { day: now.day, after: -1, upTo: now.minute },
        ];
  const done = new Set(sent);
  const result: DueReminder[] = [];
  for (const slice of slices) {
    const inside = (minute: number) => minute > slice.after && minute <= slice.upTo;
    if (prefs.water.on) {
      for (let minute = prefs.water.from; minute <= prefs.water.to; minute += prefs.water.every) {
        const key = `w:${slice.day}:${minute}`;
        if (inside(minute) && !done.has(key)) result.push({ key, text: pick(WATER_TEXTS, key) });
      }
    }
    for (const meal of prefs.meals) {
      const key = `m:${meal.id}:${slice.day}`;
      if (inside(meal.minute) && !done.has(key)) result.push({ key, text: `🍽 ${meal.label}: загляните в «Форму» и запишите приём пищи.` });
    }
  }
  return result;
}

/** Список отправленных без устаревших ключей (оставляем вчера и сегодня). */
export function nextSent(sent: string[], added: string[], nowMs: number, tz: string): string[] {
  const yesterday = localParts(nowMs - 24 * 3_600_000, tz).day;
  const keep = (key: string) => {
    const day = key.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    return day ? day >= yesterday : false;
  };
  return [...new Set([...sent, ...added])].filter(keep);
}
