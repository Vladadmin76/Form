import { createServerFn } from "@tanstack/react-start";
import { ZERO, roundNutrients } from "@/lib/nutrition";
import type { Nutrients, Tone, WeightTrend } from "@/lib/types";

type MotiveInput = {
  tone: Tone;
  streak: number;
  before: number;
  net: number;
  target: number;
  protein: number;
  proteinGoal: number;
  trend: WeightTrend;
};

const TONES = new Set<Tone>(["good", "slip", "streak", "neutral"]);
const TRENDS = new Set<WeightTrend>(["down", "up", "flat", "unknown"]);

function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export const askMotivation = createServerFn({ method: "POST" })
  .validator((input: unknown): MotiveInput => {
    if (!input || typeof input !== "object") throw new Error("Некорректный запрос");
    const data = input as Record<string, unknown>;
    const tone = data.tone;
    const trend = data.trend;
    if (typeof tone !== "string" || !TONES.has(tone as Tone)) throw new Error("Некорректный запрос");
    if (typeof trend !== "string" || !TRENDS.has(trend as WeightTrend)) throw new Error("Некорректный запрос");
    const streak = num(data.streak, 0, 4000);
    const before = num(data.before, 0, 4000);
    const netKcal = num(data.net, -5000, 20000);
    const target = num(data.target, 0, 8000);
    const protein = num(data.protein, 0, 1000);
    const proteinGoal = num(data.proteinGoal, 0, 1000);
    if (streak === null || before === null || netKcal === null || target === null || protein === null || proteinGoal === null) {
      throw new Error("Некорректный запрос");
    }
    return { tone: tone as Tone, trend: trend as WeightTrend, streak, before, net: netKcal, target, protein, proteinGoal };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Фраза сейчас недоступна" };
    const toneHint: Record<Tone, string> = {
      neutral: "Новый профиль или вчера записей не было. Только тёплый позитивный настрой на сегодня. Не упоминай цифры, пропуски и серии.",
      good: "Вчера уложился в цель. Искренне похвали и поддержи.",
      streak: `Несколько дней подряд в цели (${data.before}). Отметь устойчивый ритм без пафоса.`,
      slip: "Вчера вышло выше цели. Поддержи мягко, без упрёков и без слов «срыв» и «нарушил». Скажи, что сегодня новый день.",
    };
    const prompt = `Контекст дневника питания за вчерашний день, это не диагноз:
${toneHint[data.tone]}
вчера: ${Math.round(data.net)} ккал при цели ${Math.round(data.target)}
белок вчера: ${Math.round(data.protein)} г из ориентира ${Math.round(data.proteinGoal)} г
тренд веса: ${data.trend}

Напиши одну подбадривающую фразу на сегодня на русском. Спокойно, на «ты», без стыда, без медицинских обещаний и без спортивного пафоса. 12–20 слов. Без кавычек и без эмодзи. Каждый день фраза должна звучать по-новому.`;
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "deepseek-flash",
          thinking: { type: "disabled" },
          max_tokens: 120,
          temperature: 0.9,
          messages: [
            {
              role: "system",
              content: "Ты пишешь одну короткую фразу для личного дневника питания. Никаких списков и советов с дозировками.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) return { ok: false as const, error: `DeepSeek ответил ${res.status}` };
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content?.replace(/\s+/g, " ").trim() ?? "";
      if (!text) return { ok: false as const, error: "Пустой ответ" };
      return { ok: true as const, text: text.slice(0, 280) };
    } catch {
      return { ok: false as const, error: "Не удалось связаться с DeepSeek" };
    }
  });

export type RecognizedDish = {
  name: string;
  grams: number;
  nutrients: Nutrients;
  note: string;
};

function readNutrient(raw: Record<string, unknown>, key: string, max: number): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, value);
}

export const recognizeDish = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Нет фото");
    const image = (input as { image?: unknown }).image;
    if (typeof image !== "string" || image.length < 100 || image.length > 1_200_000) {
      throw new Error("Фото слишком большое или пустое");
    }
    if (!/^[a-zA-Z0-9+/=]+$/.test(image)) throw new Error("Фото повреждено");
    return { image };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Распознавание сейчас недоступно" };
    const instruction = `Оцени блюдо на фото как порцию, которую, скорее всего, съедят. Верни только JSON без пояснений:
{"name":"коротко по-русски","grams":число,"kcal":число,"protein":число,"fat":число,"carbs":число,"fiber":число,"iron":мг,"vitD":мкг,"b12":мкг,"omega3":г,"calcium":мг,"magnesium":мг,"potassium":мг,"vitC":мг,"zinc":мг,"folate":мкг,"sodium":мг,"note":"одна короткая оговорка"}
Числа — на всю порцию, не на 100 г. Если не уверен, всё равно дай осторожную оценку.`;
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "deepseek-flash",
          thinking: { type: "disabled" },
          max_tokens: 450,
          temperature: 0.2,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: instruction },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.image}` } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) return { ok: false as const, error: `DeepSeek ответил ${res.status}` };
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content ?? "";
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start < 0 || end <= start) return { ok: false as const, error: "Не получилось разобрать ответ" };
      const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      const name = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 80) : "";
      const gramsRaw = parsed.grams;
      const grams =
        typeof gramsRaw === "number" && Number.isFinite(gramsRaw) ? Math.round(Math.min(1500, Math.max(20, gramsRaw))) : 200;
      if (!name) return { ok: false as const, error: "Блюдо не распознано" };
      const nutrients = roundNutrients({
        ...ZERO,
        kcal: readNutrient(parsed, "kcal", 3500),
        protein: readNutrient(parsed, "protein", 250),
        fat: readNutrient(parsed, "fat", 250),
        carbs: readNutrient(parsed, "carbs", 400),
        fiber: readNutrient(parsed, "fiber", 80),
        iron: readNutrient(parsed, "iron", 40),
        vitD: readNutrient(parsed, "vitD", 50),
        b12: readNutrient(parsed, "b12", 50),
        omega3: readNutrient(parsed, "omega3", 15),
        calcium: readNutrient(parsed, "calcium", 2000),
        magnesium: readNutrient(parsed, "magnesium", 800),
        potassium: readNutrient(parsed, "potassium", 4000),
        vitC: readNutrient(parsed, "vitC", 500),
        zinc: readNutrient(parsed, "zinc", 30),
        folate: readNutrient(parsed, "folate", 800),
        sodium: readNutrient(parsed, "sodium", 5000),
      });
      const note = typeof parsed.note === "string" ? parsed.note.trim().slice(0, 160) : "";
      const dish: RecognizedDish = { name, grams, nutrients, note };
      return { ok: true as const, dish };
    } catch {
      return { ok: false as const, error: "Не удалось распознать фото" };
    }
  });
