import type {
  ActivityEntry,
  ActivityLevel,
  AdaptiveState,
  Fasting,
  LogEntry,
  Nutrients,
  Profile,
  Sex,
  Tone,
  WeightEntry,
  WeightTrend,
} from "@/lib/types";

export const NUTRIENT_KEYS = [
  "kcal",
  "protein",
  "fat",
  "carbs",
  "fiber",
  "iron",
  "vitD",
  "b12",
  "omega3",
  "calcium",
  "magnesium",
  "potassium",
  "vitC",
  "zinc",
  "folate",
  "sodium",
] as const satisfies readonly (keyof Nutrients)[];

export const ZERO: Nutrients = {
  kcal: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  fiber: 0,
  iron: 0,
  vitD: 0,
  b12: 0,
  omega3: 0,
  calcium: 0,
  magnesium: 0,
  potassium: 0,
  vitC: 0,
  zinc: 0,
  folate: 0,
  sodium: 0,
};

export const ACTIVITIES: { id: ActivityLevel; label: string; hint: string; factor: number }[] = [
  { id: "sedentary", label: "Минимальная", hint: "Сидячая работа, почти без ходьбы", factor: 1.2 },
  { id: "light", label: "Лёгкая", hint: "1–3 прогулки или тренировки в неделю", factor: 1.375 },
  { id: "moderate", label: "Средняя", hint: "3–5 тренировок в неделю", factor: 1.55 },
  { id: "active", label: "Высокая", hint: "Почти каждый день или физическая работа", factor: 1.725 },
  { id: "very", label: "Очень высокая", hint: "Две нагрузки в день или тяжёлый труд", factor: 1.9 },
];

export const MET: Record<Exclude<ActivityLevel, "sedentary"> | "walk" | "run" | "strength" | "cycle" | "yoga", number> =
  {
    light: 3,
    moderate: 5,
    active: 7,
    very: 9,
    walk: 3.5,
    run: 9,
    strength: 5,
    cycle: 7,
    yoga: 2.5,
  };

export type MicroKey = Exclude<keyof Nutrients, "kcal" | "protein" | "fat" | "carbs">;

export const MICRO_REPORT: { key: MicroKey; label: string; unit: string; kind: "goal" | "limit" }[] = [
  { key: "fiber", label: "Клетчатка", unit: "г", kind: "goal" },
  { key: "iron", label: "Железо", unit: "мг", kind: "goal" },
  { key: "vitD", label: "Витамин D", unit: "мкг", kind: "goal" },
  { key: "b12", label: "Витамин B12", unit: "мкг", kind: "goal" },
  { key: "omega3", label: "Омега-3", unit: "г", kind: "goal" },
  { key: "calcium", label: "Кальций", unit: "мг", kind: "goal" },
  { key: "magnesium", label: "Магний", unit: "мг", kind: "goal" },
  { key: "potassium", label: "Калий", unit: "мг", kind: "goal" },
  { key: "vitC", label: "Витамин C", unit: "мг", kind: "goal" },
  { key: "zinc", label: "Цинк", unit: "мг", kind: "goal" },
  { key: "folate", label: "Фолат", unit: "мкг", kind: "goal" },
  { key: "sodium", label: "Натрий", unit: "мг", kind: "limit" },
];

export function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export function addDays(key: string, delta: number): string {
  const dt = parseDay(key);
  dt.setDate(dt.getDate() + delta);
  return dayKey(dt);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

export function roundNutrients(n: Nutrients): Nutrients {
  const out = { ...n };
  for (const key of NUTRIENT_KEYS) {
    out[key] = key === "kcal" ? Math.round(n[key]) : Math.round(n[key] * 100) / 100;
  }
  return out;
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const out = { ...ZERO };
  for (const key of NUTRIENT_KEYS) out[key] = a[key] + b[key];
  return out;
}

export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  return roundNutrients(multiply(per100, grams / 100));
}

export function multiply(n: Nutrients, factor: number): Nutrients {
  const out = { ...ZERO };
  for (const key of NUTRIENT_KEYS) out[key] = n[key] * factor;
  return roundNutrients(out);
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce(addNutrients, { ...ZERO });
}

export function bmi(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  if (meters <= 0) return 0;
  return weightKg / (meters * meters);
}

export function bmiStage(value: number): { title: string; detail: string } {
  if (value < 16) return { title: "Выраженный дефицит массы", detail: "ИМТ ниже 16" };
  if (value < 18.5) return { title: "Недостаточная масса тела", detail: "ИМТ 16–18,4" };
  if (value < 25) return { title: "Норма", detail: "ИМТ 18,5–24,9" };
  if (value < 30) return { title: "Избыточная масса тела", detail: "ИМТ 25–29,9" };
  if (value < 35) return { title: "Ожирение I степени", detail: "ИМТ 30–34,9" };
  if (value < 40) return { title: "Ожирение II степени", detail: "ИМТ 35–39,9" };
  return { title: "Ожирение III степени", detail: "ИМТ 40 и выше" };
}

export function bmr(profile: Pick<Profile, "weightKg" | "heightCm" | "age" | "sex">): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  return Math.round(profile.sex === "male" ? base + 5 : base - 161);
}

export function activityFactor(level: ActivityLevel): number {
  return ACTIVITIES.find((item) => item.id === level)?.factor ?? 1.2;
}

export function tdee(profile: Profile): number {
  return Math.round(bmr(profile) * activityFactor(profile.activity));
}

export function calorieFloor(sex: Sex): number {
  return sex === "female" ? 1200 : 1500;
}

export function baseTarget(profile: Profile, adaptive: number | null): number {
  if (adaptive && adaptive > 0) return Math.round(adaptive);
  return Math.max(calorieFloor(profile.sex), tdee(profile) - profile.deficitKcal);
}

export function targetForDate(profile: Profile, adaptive: AdaptiveState, fasting: Fasting, date: string): number {
  const base = baseTarget(profile, adaptive.target);
  if (!fasting.enabled || fasting.protocol !== "5-2") return base;
  const dow = parseDay(date).getDay();
  if (fasting.fastDays.includes(dow)) return profile.sex === "female" ? 500 : 600;
  return base;
}

// Цель по воде: 30 мл на кг, но не больше нормы EFSA по напиткам
// (мужчины 2000 мл, женщины 1600 мл) и не меньше 1500 мл.
// Больше можно поставить вручную в профиле.
export function waterGoalFor(weightKg: number, sex: Sex): number {
  const cap = sex === "male" ? 2000 : 1600;
  const byWeight = Math.round((weightKg * 30) / 50) * 50;
  return Math.max(1500, Math.min(cap, byWeight));
}

export function rdi(sex: Sex, key: MicroKey): number {
  const female = sex === "female";
  switch (key) {
    case "fiber":
      return female ? 25 : 38;
    case "iron":
      return female ? 18 : 8;
    case "vitD":
      return 15;
    case "b12":
      return 2.4;
    case "omega3":
      return female ? 1.1 : 1.6;
    case "calcium":
      return 1000;
    case "magnesium":
      return female ? 320 : 420;
    case "potassium":
      return female ? 2600 : 3400;
    case "vitC":
      return female ? 75 : 90;
    case "zinc":
      return female ? 8 : 11;
    case "folate":
      return 400;
    case "sodium":
      return 2000;
    default:
      return 0;
  }
}

export function stepsKcal(steps: number, weightKg: number): number {
  return Math.max(0, Math.round(steps * 0.04 * (weightKg / 70)));
}

export function metKcal(met: number, weightKg: number, minutes: number): number {
  return Math.max(0, Math.round(met * weightKg * (minutes / 60)));
}

export function suggestMeal(d = new Date()): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = d.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

export function dayTotals(logs: LogEntry[], activities: ActivityEntry[], date: string) {
  const food = sumNutrients(logs.filter((item) => item.date === date).map((item) => item.nutrients));
  const active = activities.filter((item) => item.date === date).reduce((sum, item) => sum + item.kcal, 0);
  return { food, active, net: Math.round(food.kcal - active) };
}

export type DayStatus = "good" | "slip" | "pending" | "empty";

export function dayStatus(
  profile: Profile,
  adaptive: AdaptiveState,
  fasting: Fasting,
  logs: LogEntry[],
  activities: ActivityEntry[],
  date: string,
  today: string,
): DayStatus {
  const hasFood = logs.some((item) => item.date === date);
  if (!hasFood) return date === today ? "pending" : "empty";
  const { net } = dayTotals(logs, activities, date);
  const target = targetForDate(profile, adaptive, fasting, date);
  return net <= target * 1.02 ? "good" : "slip";
}

export function streakInfo(
  profile: Profile,
  adaptive: AdaptiveState,
  fasting: Fasting,
  logs: LogEntry[],
  activities: ActivityEntry[],
  today: string,
): { ongoing: number; beforeToday: number; today: DayStatus } {
  const todayState = dayStatus(profile, adaptive, fasting, logs, activities, today, today);
  let before = 0;
  let cursor = addDays(today, -1);
  while (dayStatus(profile, adaptive, fasting, logs, activities, cursor, today) === "good") {
    before += 1;
    cursor = addDays(cursor, -1);
    if (before > 400) break;
  }
  const ongoing = todayState === "good" ? before + 1 : todayState === "slip" ? 0 : before;
  return { ongoing, beforeToday: before, today: todayState };
}

export function motivationTone(info: { ongoing: number; today: DayStatus }): Tone {
  if (info.today === "slip") return "slip";
  if (info.ongoing >= 3) return "streak";
  if (info.today === "good") return "good";
  return "neutral";
}

// Тон фразы дня строится по ВЧЕРАШНЕМУ дню.
// Новый профиль или вчера нет записей — нейтральный (только тёплый настрой).
export function yesterdayTone(
  profile: Profile,
  adaptive: AdaptiveState,
  fasting: Fasting,
  logs: LogEntry[],
  activities: ActivityEntry[],
  today: string,
): { tone: Tone; before: number; date: string } {
  const date = addDays(today, -1);
  const status = dayStatus(profile, adaptive, fasting, logs, activities, date, today);
  if (status === "slip") return { tone: "slip", before: 0, date };
  if (status === "good") {
    let run = 0;
    let cursor = date;
    while (dayStatus(profile, adaptive, fasting, logs, activities, cursor, today) === "good") {
      run += 1;
      cursor = addDays(cursor, -1);
      if (run > 400) break;
    }
    return { tone: run >= 3 ? "streak" : "good", before: run, date };
  }
  return { tone: "neutral", before: 0, date };
}

export function weightTrend(weights: WeightEntry[]): WeightTrend {
  if (weights.length < 2) return "unknown";
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const delta = sorted[sorted.length - 1].kg - sorted[sorted.length - 2].kg;
  if (delta <= -0.1) return "down";
  if (delta >= 0.1) return "up";
  return "flat";
}

export type AdaptivePreview =
  | {
      ok: true;
      tdee: number;
      target: number;
      from: number;
      deltaKg: number;
      days: number;
      avgIntake: number;
      logDays: number;
    }
  | { ok: false; reason: string };

export function previewAdaptive(args: {
  profile: Profile;
  weights: WeightEntry[];
  logs: LogEntry[];
  currentTarget: number;
}): AdaptivePreview {
  const weights = [...args.weights].sort((a, b) => a.date.localeCompare(b.date));
  if (weights.length < 2) return { ok: false, reason: "Нужны минимум два взвешивания." };
  const end = weights[weights.length - 1];
  const startCandidates = weights.filter((item) => daysBetween(item.date, end.date) >= 7);
  if (startCandidates.length === 0) {
    return { ok: false, reason: "Между первым и последним весом меньше семи дней." };
  }
  const windowStart =
    [...startCandidates].reverse().find((item) => daysBetween(item.date, end.date) <= 28) ?? startCandidates[0];
  const days = daysBetween(windowStart.date, end.date);
  const logs = args.logs.filter((item) => item.date >= windowStart.date && item.date <= end.date);
  const logDates = new Set(logs.map((item) => item.date));
  if (logDates.size < 5) {
    return { ok: false, reason: "В этом окне меньше пяти дней с едой. Без дневника тренд врёт." };
  }
  const intake = logs.reduce((sum, item) => sum + item.nutrients.kcal, 0);
  const avgIntake = intake / logDates.size;
  const deltaKg = end.kg - windowStart.kg;
  const actual = avgIntake - (deltaKg * 7700) / days;
  if (!Number.isFinite(actual) || actual < 900 || actual > 5500) {
    return { ok: false, reason: "Оценка расхода вышла за разумные рамки. Проверьте вес и порции." };
  }
  const floor = calorieFloor(args.profile.sex);
  let target = Math.round(Math.max(floor, Math.min(4500, actual - args.profile.deficitKcal)));
  const drift = target - args.currentTarget;
  if (drift > 200) target = args.currentTarget + 200;
  if (drift < -200) target = args.currentTarget - 200;
  target = Math.max(floor, target);
  return {
    ok: true,
    tdee: Math.round(actual),
    target,
    from: args.currentTarget,
    deltaKg: Math.round(deltaKg * 100) / 100,
    days,
    avgIntake: Math.round(avgIntake),
    logDays: logDates.size,
  };
}

export function fastingClock(fasting: Fasting, now = new Date()): { phase: "eat" | "fast"; minutesLeft: number } | null {
  if (!fasting.enabled || fasting.protocol === "5-2") return null;
  const [hh, mm] = fasting.eatingStart.split(":").map(Number);
  const start = (hh || 0) * 60 + (mm || 0);
  const length = Math.round(fasting.eatingHours * 60);
  const end = (start + length) % 1440;
  const cur = now.getHours() * 60 + now.getMinutes();
  const eating =
    length >= 1440 ? true : start < end ? cur >= start && cur < end : cur >= start || cur < end;
  const until = (target: number) => (target - cur + 1440) % 1440 || 1440;
  if (eating) return { phase: "eat", minutesLeft: until(end) };
  return { phase: "fast", minutesLeft: until(start) };
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export function macroTargets(profile: Profile, kcal: number) {
  const protein = Math.round(profile.weightKg * 1.6);
  const fat = Math.round(profile.weightKg * 0.8);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fiber = rdi(profile.sex, "fiber");
  return { protein, fat, carbs, fiber };
}

export function proteinGoal(profile: Profile): number {
  return Math.round(profile.weightKg * 1.6);
}
