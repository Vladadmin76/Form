// Разбор сообщений боту про воду: «выпил», «2 стакана», «400 мл», «полстакана», «0,5 л».
// Чистая функция: используется на сервере и в тестах.

export const GLASS_ML = 200;
export const MIN_ML = 50;
export const MAX_ML = 2000;

export type WaterParse = { ml: number } | { error: "range" } | null;

const WORDS: Record<string, number> = {
  один: 1, одну: 1, одного: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, полтора: 1.5, полторы: 1.5,
};

const VERB = /^(я\s+)?(выпил[аи]?|попил[аи]?|выпито|было|добавь|добавить|\+)\s*/;
const FILLER = /(^|\s+)(воды|водички|воду|вода)(?=\s|$)/g;

function done(ml: number): WaterParse {
  const rounded = Math.round(ml);
  return rounded >= MIN_ML && rounded <= MAX_ML ? { ml: rounded } : { error: "range" };
}

export function parseWater(input: string): WaterParse {
  let text = input.toLowerCase().replace(/ё/g, "е").replace(/,/g, ".").replace(/[!?…]+$/g, "").trim().replace(/\.$/, "");
  if (!text) return null;
  const hadVerb = VERB.test(text);
  text = text.replace(VERB, "").replace(FILLER, "").trim();
  if (text === "") return hadVerb ? done(GLASS_ML) : null;
  if (/^(пол\s?стакана|пол\s?стакан|половину стакана|половинку стакана)$/.test(text)) return done(GLASS_ML / 2);
  if (/^(стакан|стакана|стаканчик|стакашек)$/.test(text)) return done(GLASS_ML);

  const num = "(\\d+(?:\\.\\d+)?|" + Object.keys(WORDS).join("|") + ")";
  const value = (raw: string) => (raw in WORDS ? WORDS[raw] : Number(raw));

  const ml = text.match(new RegExp(`^${num}\\s*(мл|ml|миллилитр[а-я]*)$`));
  if (ml) return done(value(ml[1]));
  const liters = text.match(new RegExp(`^${num}\\s*(л|l|литр[а-я]*)$`));
  if (liters) return done(value(liters[1]) * 1000);
  const glasses = text.match(new RegExp(`^${num}\\s*(стакан[а-я]*|ст\\.?)$`));
  if (glasses) return done(value(glasses[1]) * GLASS_ML);
  // Голое число: до 10 это стаканы, больше это миллилитры.
  const bare = text.match(new RegExp(`^${num}$`));
  if (bare) {
    const n = value(bare[1]);
    return done(n <= 10 ? n * GLASS_ML : n);
  }
  return null;
}
