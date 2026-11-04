import { useEffect, useRef, useState } from "react";
import { Camera, Mic, ScanBarcode, Search, ChefHat, PenLine, Trash2 } from "lucide-react";
import { recognizeDish } from "@/lib/ai";
import { decodeBarcodeFile, blurScore, lockFocus, productReader } from "@/lib/barcode";
import { findByBarcode, normalizeQuery, searchFoods } from "@/lib/foods";
import { fmt } from "@/lib/format";
import { MICRO_REPORT, multiply, scaleNutrients, sumNutrients, ZERO } from "@/lib/nutrition";
import { lookupBarcode } from "@/lib/off";
import { fileToJpeg } from "@/lib/photos";
import { useForma } from "@/lib/store";
import type { FoodItem, MealSlot, Nutrients, Recipe, RecipeIngredient } from "@/lib/types";
import { Field, MealPicker } from "@/components/forma/bits";

type Mode = "search" | "manual" | "barcode" | "photo" | "voice" | "recipe";

const MODES: { id: Mode; label: string; icon: typeof Search }[] = [
  { id: "search", label: "Поиск", icon: Search },
  { id: "manual", label: "Вручную", icon: PenLine },
  { id: "barcode", label: "Код", icon: ScanBarcode },
  { id: "photo", label: "Фото", icon: Camera },
  { id: "voice", label: "Голос", icon: Mic },
  { id: "recipe", label: "Рецепт", icon: ChefHat },
];

export function FoodScreen() {
  const [mode, setMode] = useState<Mode>("search");
  const meal = useForma((state) => state.pendingMeal);
  const setMeal = useForma((state) => state.setPendingMeal);
  const date = useForma((state) => state.selectedDate);

  return (
    <div className="flex flex-col gap-4 px-5 pt-6">
      <header>
        <p className="text-sm text-muted">Дневник · {date.split("-").reverse().join(".")}</p>
        <h1 className="font-display text-3xl">Добавить еду</h1>
      </header>
      <MealPicker value={meal} onChange={setMeal} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {MODES.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className="chip inline-flex shrink-0 items-center" data-on={mode === item.id} onClick={() => setMode(item.id)}>
              <Icon className="mr-1 size-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      {mode === "search" ? <SearchPane /> : null}
      {mode === "manual" ? <ManualPane /> : null}
      {mode === "barcode" ? <BarcodePane /> : null}
      {mode === "photo" ? <PhotoPane /> : null}
      {mode === "voice" ? <VoicePane onSearch={() => setMode("search")} /> : null}
      {mode === "recipe" ? <RecipePane /> : null}
    </div>
  );
}

function useLog() {
  const date = useForma((state) => state.selectedDate);
  const meal = useForma((state) => state.pendingMeal);
  const addLog = useForma((state) => state.addLog);
  const setBanner = useForma((state) => state.setBanner);
  return (name: string, amountLabel: string, nutrients: Nutrients) => {
    addLog({ date, meal, name, amountLabel, nutrients });
    setBanner(`${name}: ${fmt(nutrients.kcal)} ккал`);
  };
}

function SearchPane() {
  const custom = useForma((state) => state.customFoods);
  const removeCustomFood = useForma((state) => state.removeCustomFood);
  const recipes = useForma((state) => state.recipes);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const foods = searchFoods(query, custom);
  const q = normalizeQuery(query);
  const recipeHits = recipes.filter((item) => !q || normalizeQuery(item.name).includes(q));

  return (
    <div className="flex flex-col gap-3">
      <input className="field" placeholder="Гречка, творог, лосось…" aria-label="Поиск продукта" value={query} onChange={(event) => setQuery(event.target.value)} />
      {picked ? <PortionFood food={picked} onClose={() => setPicked(null)} /> : null}
      {recipe ? <PortionRecipe recipe={recipe} onClose={() => setRecipe(null)} /> : null}
      <ul className="flex flex-col gap-2">
        {recipeHits.map((item) => (
          <li key={item.id}>
            <button type="button" className="card flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => { setRecipe(item); setPicked(null); blurField(); }}>
              <span>
                {item.name}
                <span className="block text-sm text-muted">рецепт · {fmt(item.perServing.kcal)} ккал / порция</span>
              </span>
            </button>
          </li>
        ))}
        {foods.map((item) => (
          <li key={item.id} className="flex items-stretch gap-2">
            <button type="button" className="card flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => { setPicked(item); setRecipe(null); blurField(); }}>
              <span>
                {item.name}
                <span className="block text-sm text-muted">{fmt(item.per100.kcal)} ккал / 100 г</span>
              </span>
            </button>
            {item.custom ? (
              <button
                type="button"
                className="card flex min-w-12 items-center justify-center px-3 text-muted"
                aria-label={`Удалить ${item.name} из моей базы`}
                onClick={() => {
                  if (!window.confirm(`Удалить «${item.name}» из моей базы?`)) return;
                  removeCustomFood(item.id);
                  if (picked?.id === item.id) setPicked(null);
                }}
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {query && foods.length === 0 && recipeHits.length === 0 ? <p className="text-sm text-muted">Ничего не нашлось. Добавьте вручную или сфотографируйте.</p> : null}
    </div>
  );
}

function blurField() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

const NUTRIENT_FIELDS: { key: keyof Nutrients; label: string }[] = [
  { key: "kcal", label: "Ккал" },
  { key: "protein", label: "Белки, г" },
  { key: "fat", label: "Жиры, г" },
  { key: "carbs", label: "Углеводы, г" },
  ...MICRO_REPORT.map((item) => ({ key: item.key, label: `${item.label}, ${item.unit}` })),
];

function emptyNutrientText(): Record<keyof Nutrients, string> {
  return {
    kcal: "",
    protein: "",
    fat: "",
    carbs: "",
    fiber: "",
    iron: "",
    vitD: "",
    b12: "",
    omega3: "",
    calcium: "",
    magnesium: "",
    potassium: "",
    vitC: "",
    zinc: "",
    folate: "",
    sodium: "",
  };
}

function nutrientText(food: Nutrients): Record<keyof Nutrients, string> {
  const text = emptyNutrientText();
  for (const field of NUTRIENT_FIELDS) text[field.key] = food[field.key] ? trimNum(food[field.key]) : "";
  return text;
}

function nutrientsFromText(text: Record<keyof Nutrients, string>): Nutrients {
  const nutrients = { ...ZERO };
  for (const field of NUTRIENT_FIELDS) nutrients[field.key] = num(text[field.key]);
  return nutrients;
}

function NutrientFields({
  values,
  onChange,
}: {
  values: Record<keyof Nutrients, string>;
  onChange: (key: keyof Nutrients, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {NUTRIENT_FIELDS.map((field) => (
        <Field key={field.key} label={field.label}>
          <input
            className="field tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={values[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
        </Field>
      ))}
    </div>
  );
}

function PortionFood({ food, onClose }: { food: FoodItem; onClose: () => void }) {
  const log = useLog();
  const rememberPiece = useForma((state) => state.rememberPiece);
  const saveFoodProfile = useForma((state) => state.saveFoodProfile);
  const [draft, setDraft] = useState(() => nutrientText(food.per100));
  const per100 = nutrientsFromText(draft);
  const key = food.barcode || food.id;
  const savedGrams = useForma((state) => state.pieceWeights[key] || (!food.pieceKcal ? food.pieceGrams || 0 : 0));
  const savedKcal = useForma((state) => state.pieceKcals[key] || food.pieceKcal || 0);
  const [mode, setMode] = useState<"g" | "pc">(savedGrams || savedKcal ? "pc" : "g");
  const [unit, setUnit] = useState<"g" | "kcal">(savedKcal ? "kcal" : "g");
  const [grams, setGrams] = useState("100");
  const [pieceG, setPieceG] = useState(savedGrams ? trimNum(savedGrams) : "");
  const [pieceK, setPieceK] = useState(savedKcal ? trimNum(savedKcal) : "");
  const [count, setCount] = useState("1");
  const pieces = num(count);
  const oneG = num(pieceG);
  const oneK = num(pieceK);
  const perKcal = per100.kcal;
  const amount =
    mode === "g"
      ? num(grams)
      : unit === "g"
        ? oneG > 0 && pieces > 0
          ? oneG * pieces
          : 0
        : perKcal > 0 && oneK > 0 && pieces > 0
          ? (oneK * pieces * 100) / perKcal
          : 0;
  const nutrients =
    amount > 0
      ? scaleNutrients(per100, amount)
      : mode === "pc" && unit === "kcal" && perKcal <= 0 && oneK > 0 && pieces > 0
        ? { ...ZERO, kcal: Math.round(oneK * pieces) }
        : { ...ZERO };
  const amountLabel =
    mode === "g"
      ? `${fmt(amount, amount % 1 ? 1 : 0)} г`
      : unit === "g"
        ? `${fmt(pieces, pieces % 1 ? 1 : 0)} шт · ${fmt(amount, amount % 1 ? 1 : 0)} г`
        : `${fmt(pieces, pieces % 1 ? 1 : 0)} шт · ${fmt(nutrients.kcal)} ккал`;
  const ready = mode === "g" ? amount > 0 : unit === "g" ? amount > 0 : (perKcal > 0 ? amount > 0 : nutrients.kcal > 0);
  return (
    <div data-sheet className="sheet-panel">
      <div className="card p-4">
        <p className="font-semibold">{food.name}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="chip w-full" data-on={mode === "g"} onClick={() => setMode("g")}>
            Граммы
          </button>
          <button type="button" className="chip w-full" data-on={mode === "pc"} onClick={() => setMode("pc")}>
            Штуки
          </button>
        </div>
        {mode === "g" ? (
          <>
            <Field label="Граммы">
              <input className="field tabular-nums" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={grams} onChange={(event) => setGrams(event.target.value)} />
            </Field>
            <div className="mt-2 flex gap-2">
              {["50", "100", "150", "200"].map((value) => (
                <button key={value} type="button" className="chip" data-on={grams === value} onClick={() => setGrams(value)}>
                  {value}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">
              {unit === "g" ? "Вес одной штуки — с пачки. Потом сколько съели." : "Калории одной штуки — с пачки. БЖУ посчитаем по составу продукта."}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="chip w-full" data-on={unit === "g"} onClick={() => setUnit("g")}>
                Вес
              </button>
              <button type="button" className="chip w-full" data-on={unit === "kcal"} onClick={() => setUnit("kcal")}>
                Ккал
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label={unit === "g" ? "Одна штука, г" : "Одна штука, ккал"}>
                <input
                  className="field tabular-nums"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder="с пачки"
                  value={unit === "g" ? pieceG : pieceK}
                  onChange={(event) => (unit === "g" ? setPieceG(event.target.value) : setPieceK(event.target.value))}
                />
              </Field>
              <Field label="Сколько">
                <input className="field tabular-nums" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={count} onChange={(event) => setCount(event.target.value)} />
              </Field>
            </div>
            <div className="mt-2 flex gap-2">
              {["1", "2", "3", "4"].map((value) => (
                <button key={value} type="button" className="chip" data-on={count === value} onClick={() => setCount(value)}>
                  {value}
                </button>
              ))}
            </div>
            {unit === "g" && oneG > 0 && pieces > 0 ? (
              <p className="mt-2 tabular-nums text-sm text-muted">
                {fmt(pieces, pieces % 1 ? 1 : 0)} × {fmt(oneG, oneG % 1 ? 1 : 0)} г = {fmt(amount, amount % 1 ? 1 : 0)} г
              </p>
            ) : null}
            {unit === "kcal" && oneK > 0 && pieces > 0 ? (
              <p className="mt-2 tabular-nums text-sm text-muted">
                {fmt(pieces, pieces % 1 ? 1 : 0)} × {fmt(oneK, oneK % 1 ? 1 : 0)} ккал
              </p>
            ) : null}
          </>
        )}
        <p className="mt-3 tabular-nums text-sm text-muted">
          {fmt(nutrients.kcal)} ккал · Б {fmt(nutrients.protein, 1)} · Ж {fmt(nutrients.fat, 1)} · У {fmt(nutrients.carbs, 1)}
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-primary">Дописать железо и витамины</summary>
          <p className="mt-2 text-sm text-muted">На 100 г, с упаковки. Пустое поле — ноль. Сохранится в этот продукт и попадёт в недельную проверку.</p>
          <div className="mt-3">
            <NutrientFields values={draft} onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))} />
          </div>
        </details>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready}
            onClick={() => {
              if (mode === "pc" && unit === "g" && oneG > 0) rememberPiece(key, oneG, "g", food.id);
              if (mode === "pc" && unit === "kcal" && oneK > 0) rememberPiece(key, oneK, "kcal", food.id);
              saveFoodProfile(food, per100);
              log(food.name, amountLabel, nutrients);
              onClose();
            }}
          >
            В дневник
          </button>
        </div>
      </div>
    </div>
  );
}

function PortionRecipe({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [servings, setServings] = useState("1");
  const log = useLog();
  const count = Number(servings.replace(",", ".")) || 0;
  const nutrients = count > 0 ? multiply(recipe.perServing, count) : { ...ZERO };
  return (
    <div data-sheet className="sheet-panel">
      <div className="card p-4">
      <p className="font-semibold">{recipe.name}</p>
      <Field label="Порции">
        <input className="field tabular-nums" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={servings} onChange={(event) => setServings(event.target.value)} />
      </Field>
      <p className="mt-3 tabular-nums text-sm text-muted">{fmt(nutrients.kcal)} ккал на выбранные порции</p>
      <button
        type="button"
        className="btn btn-primary mt-3 w-full"
        disabled={count <= 0}
        onClick={() => {
          log(recipe.name, `${fmt(count, count % 1 ? 1 : 0)} порц.`, nutrients);
          onClose();
        }}
      >
        В дневник
      </button>
      </div>
    </div>
  );
}

function ManualPane() {
  const addCustomFood = useForma((state) => state.addCustomFood);
  const log = useLog();
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("100");
  const [per100, setPer100] = useState(false);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [micros, setMicros] = useState(emptyNutrientText);
  const [save, setSave] = useState(true);
  const [barcode, setBarcode] = useState("");

  const build = (): Nutrients => ({
    ...nutrientsFromText(micros),
    kcal: num(kcal),
    protein: num(protein),
    fat: num(fat),
    carbs: num(carbs),
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const portionGrams = num(grams);
        if (!name.trim() || portionGrams <= 0) return;
        const entered = build();
        const nutrients = per100 ? scaleNutrients(entered, portionGrams) : entered;
        const base = per100 ? entered : scaleNutrients(entered, (100 / portionGrams) * 100);
        log(name.trim(), `${fmt(portionGrams, portionGrams % 1 ? 1 : 0)} г`, nutrients);
        if (save) {
          addCustomFood({
            id: crypto.randomUUID(),
            name: name.trim(),
            per100: base,
            custom: true,
            barcode: barcode.trim() || undefined,
          });
        }
      }}
    >
      <Field label="Название">
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Сколько съели, г">
        <input className="field tabular-nums" inputMode="decimal" value={grams} onChange={(event) => setGrams(event.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={per100} onChange={(event) => setPer100(event.target.checked)} />
        Цифры ниже указаны на 100 г, а не на порцию
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ккал">
          <input className="field tabular-nums" inputMode="decimal" value={kcal} onChange={(event) => setKcal(event.target.value)} />
        </Field>
        <Field label="Белки, г">
          <input className="field tabular-nums" inputMode="decimal" value={protein} onChange={(event) => setProtein(event.target.value)} />
        </Field>
        <Field label="Жиры, г">
          <input className="field tabular-nums" inputMode="decimal" value={fat} onChange={(event) => setFat(event.target.value)} />
        </Field>
        <Field label="Углеводы, г">
          <input className="field tabular-nums" inputMode="decimal" value={carbs} onChange={(event) => setCarbs(event.target.value)} />
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted">Железо, витамины и остальное</summary>
        <p className="mt-2 text-sm text-muted">В той же мере, что калории выше: на порцию или на 100 г.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {MICRO_REPORT.map((item) => (
            <Field key={item.key} label={`${item.label}, ${item.unit}`}>
              <input
                className="field tabular-nums"
                inputMode="decimal"
                autoComplete="off"
                value={micros[item.key]}
                onChange={(event) => setMicros((prev) => ({ ...prev, [item.key]: event.target.value }))}
              />
            </Field>
          ))}
          <Field label="Штрихкод">
            <input className="field tabular-nums" inputMode="numeric" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
          </Field>
        </div>
      </details>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} />
        Сохранить в мою базу
      </label>
      <button className="btn btn-primary" type="submit">
        В дневник
      </button>
    </form>
  );
}

function BarcodePane() {
  const custom = useForma((state) => state.customFoods);
  const addCustomFood = useForma((state) => state.addCustomFood);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Камера или фото. Не вплотную: отодвиньте телефон, пока полоски не станут чёткими.");
  const [found, setFound] = useState<FoodItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const resolveRef = useRef<(raw: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!found) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest("[data-sheet]")) active.blur();
  }, [found]);

  const resolve = async (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8) {
      setStatus("Код слишком короткий.");
      return;
    }
    setCode(digits);
    const local = findByBarcode(digits, custom);
    if (local) {
      setFound(local);
      setStatus("Нашли в вашей базе.");
      return;
    }
    setStatus("Ищем в Open Food Facts…");
    try {
      const hit = await lookupBarcode(digits);
      if (!hit) {
        setFound(null);
        setStatus("Нет ни в базе, ни в Open Food Facts. Добавьте вручную.");
        return;
      }
      const food: FoodItem = { id: crypto.randomUUID(), name: hit.name, per100: hit.per100, barcode: digits, custom: true, pieceGrams: hit.pieceGrams };
      addCustomFood(food);
      setFound(food);
      setStatus("Нашли снаружи и сохранили локально. Дневник туда не уходит.");
    } catch {
      setFound(null);
      setStatus("Сеть недоступна, а в локальной базе такого кода нет.");
    }
  };

  resolveRef.current = resolve;

  useEffect(() => {
    if (!scanning) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let controls: { stop: () => void } | null = null;
    let watch = 0;
    let focus = 0;
    void (async () => {
      try {
        const reader = await productReader();
        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ focusMode: "continuous" }],
            } as unknown as MediaTrackConstraints,
          },
          video,
          (result) => {
            if (!result || cancelled) return;
            cancelled = true;
            const text = result.getText();
            controls?.stop();
            controlsRef.current = null;
            setScanning(false);
            void resolveRef.current(text);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        await video.play().catch(() => undefined);
        await lockFocus(video);
        if (cancelled) {
          controls.stop();
          return;
        }
        let soft = true;
        let note = "";
        const say = (text: string) => {
          if (cancelled || text === note) return;
          note = text;
          setStatus(text);
        };
        say("Не придвигайте вплотную. Отодвиньте телефон, пока полоски не станут чёткими.");
        watch = window.setInterval(() => {
          const score = blurScore(video);
          if (score == null) return;
          if (!soft && score < 60) {
            soft = true;
            say("Размыто — слишком близко. Отодвиньте на ширину ладони.");
          } else if (soft && score > 110) {
            soft = false;
            say("Резко. Держите так и не приближайте.");
          }
        }, 600);
        focus = window.setInterval(() => {
          void lockFocus(video);
        }, 2000);
      } catch {
        if (cancelled) return;
        setScanning(false);
        setStatus("Камера недоступна. Введите цифры под полосками или снимите этикетку с расстояния, где она резкая.");
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(watch);
      window.clearInterval(focus);
      controls?.stop();
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [scanning]);

  const fromFile = async (file: File) => {
    setStatus("Читаем фото…");
    const text = await decodeBarcodeFile(file);
    if (!text) {
      setStatus("На фото код не читается. Снимите ещё раз не вплотную: полоски должны быть резкими, пачка ровной.");
      return;
    }
    void resolve(text);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{status}</p>
      <video ref={videoRef} className={scanning ? "aspect-[3/4] max-h-[50vh] w-full rounded-lg bg-black object-contain" : "hidden"} muted autoPlay playsInline />
      {found ? <PortionFood food={found} onClose={() => setFound(null)} /> : null}
      {found ? null : (
        <>
      <div className="grid grid-cols-2 gap-2">
        {scanning ? (
          <button type="button" className="btn btn-ghost col-span-2" onClick={() => setScanning(false)}>
            Остановить
          </button>
        ) : (
          <>
        <button type="button" className="btn btn-primary" onClick={() => { setStatus("Смотрим в камеру…"); setScanning(true); }}>
          Камера
        </button>
        <label className="btn btn-ghost">
          Фото кода
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void fromFile(file);
            }}
          />
        </label>
          </>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void resolve(code);
        }}
      >
        <input className="field tabular-nums" inputMode="numeric" enterKeyHint="search" autoComplete="off" aria-label="Штрихкод" value={code} onChange={(event) => setCode(event.target.value)} />
        <button className="btn btn-ghost shrink-0" type="submit">
          Найти
        </button>
      </form>
        </>
      )}
    </div>
  );
}

function PhotoPane() {
  const log = useLog();
  const [status, setStatus] = useState("Снимок порции. Оценка приблизительная, её можно поправить.");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [ready, setReady] = useState(false);
  const [base, setBase] = useState<Nutrients>({ ...ZERO });
  const [baseGrams, setBaseGrams] = useState(100);

  const run = async (file: File) => {
    setBusy(true);
    setStatus("Смотрим фото…");
    try {
      const { base64 } = await fileToJpeg(file, 768, 0.7);
      const result = await recognizeDish({ data: { image: base64 } });
      if (!result.ok) {
        setStatus(result.error);
        setBusy(false);
        return;
      }
      setName(result.dish.name);
      setGrams(String(result.dish.grams));
      setKcal(String(result.dish.nutrients.kcal));
      setProtein(String(result.dish.nutrients.protein));
      setFat(String(result.dish.nutrients.fat));
      setCarbs(String(result.dish.nutrients.carbs));
      setBase(result.dish.nutrients);
      setBaseGrams(result.dish.grams);
      setReady(true);
      setStatus(result.dish.note || "Проверьте цифры перед записью.");
    } catch {
      setStatus("Не удалось прочитать фото.");
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{status}</p>
      <label className="btn btn-primary">
        <Camera className="size-4" />
        {busy ? "Ждём ответ" : "Сфотографировать"}
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void run(file);
          }}
        />
      </label>
      {ready ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const g = num(grams) || baseGrams;
            const factor = baseGrams > 0 ? g / baseGrams : 1;
            const scaled = multiply(base, factor);
            log(name.trim() || "Блюдо", `${fmt(g, 0)} г`, {
              ...scaled,
              kcal: num(kcal) || scaled.kcal,
              protein: num(protein) || scaled.protein,
              fat: num(fat) || scaled.fat,
              carbs: num(carbs) || scaled.carbs,
            });
            setReady(false);
          }}
        >
          <Field label="Название">
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Граммы">
              <input className="field tabular-nums" inputMode="decimal" value={grams} onChange={(event) => setGrams(event.target.value)} />
            </Field>
            <Field label="Ккал">
              <input className="field tabular-nums" inputMode="decimal" value={kcal} onChange={(event) => setKcal(event.target.value)} />
            </Field>
            <Field label="Белки">
              <input className="field tabular-nums" inputMode="decimal" value={protein} onChange={(event) => setProtein(event.target.value)} />
            </Field>
            <Field label="Жиры">
              <input className="field tabular-nums" inputMode="decimal" value={fat} onChange={(event) => setFat(event.target.value)} />
            </Field>
            <Field label="Углеводы">
              <input className="field tabular-nums" inputMode="decimal" value={carbs} onChange={(event) => setCarbs(event.target.value)} />
            </Field>
          </div>
          <button className="btn btn-primary" type="submit">
            В дневник
          </button>
        </form>
      ) : null}
    </div>
  );
}

function VoicePane({ onSearch }: { onSearch: () => void }) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState("Например: «200 грамм гречки» или «омлет».");
  const custom = useForma((state) => state.customFoods);
  const log = useLog();
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("100");

  const listen = () => {
    const host = window as Window & {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
    if (!Ctor) {
      setHint("В этом браузере нет распознавания речи. Напишите фразу ниже.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript ?? "";
      apply(said);
    };
    rec.onerror = () => setHint("Микрофон не ответил. Можно ввести фразу текстом.");
    rec.start();
    setHint("Слушаем…");
  };

  const apply = (said: string) => {
    const parsed = parseVoice(said);
    setText(said);
    setGrams(parsed.grams ? String(parsed.grams) : "100");
    const hits = searchFoods(parsed.query, custom, 1);
    setPicked(hits[0] ?? null);
    setHint(hits[0] ? `Похоже на «${hits[0].name}».` : "В базе нет точного совпадения — поищите вручную.");
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{hint}</p>
      <button type="button" className="btn btn-primary" onClick={listen}>
        <Mic className="size-4" />
        Сказать
      </button>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply(text);
        }}
      >
        <input className="field" aria-label="Фраза" value={text} onChange={(event) => setText(event.target.value)} />
        <button className="btn btn-ghost shrink-0" type="submit">
          Разобрать
        </button>
      </form>
      {picked ? (
        <div data-sheet className="sheet-panel">
          <div className="card p-4">
          <p className="font-semibold">{picked.name}</p>
          <Field label="Граммы">
            <input className="field tabular-nums" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={grams} onChange={(event) => setGrams(event.target.value)} />
          </Field>
          <button
            type="button"
            className="btn btn-primary mt-3 w-full"
            onClick={() => {
              const amount = num(grams) || 100;
              log(picked.name, `${fmt(amount, 0)} г`, scaleNutrients(picked.per100, amount));
            }}
          >
            В дневник
          </button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-sm font-semibold text-primary" onClick={onSearch}>
          Открыть поиск
        </button>
      )}
    </div>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

function parseVoice(text: string): { grams: number | null; query: string } {
  const phrase = text.replace(/ё/g, "е").trim();
  const lead = phrase.match(/(\d+(?:[.,]\d+)?)\s*(?:грамм(?:а|ов)?|гр|г)\s+(.+)/i);
  if (lead?.[2]) return { grams: Number(lead[1].replace(",", ".")), query: lead[2] };
  const tail = phrase.match(/(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:грамм(?:а|ов)?|гр|г)?$/i);
  if (tail?.[1] && tail[2] && /\d/.test(tail[2])) return { grams: Number(tail[2].replace(",", ".")), query: tail[1] };
  return { grams: null, query: phrase };
}

function RecipePane() {
  const custom = useForma((state) => state.customFoods);
  const recipes = useForma((state) => state.recipes);
  const addRecipe = useForma((state) => state.addRecipe);
  const removeRecipe = useForma((state) => state.removeRecipe);
  const setBanner = useForma((state) => state.setBanner);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("2");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("100");
  const [items, setItems] = useState<RecipeIngredient[]>([]);
  const hits = query ? searchFoods(query, custom, 6) : [];

  const save = () => {
    const count = num(servings);
    if (!name.trim() || count <= 0 || items.length === 0) return;
    const total = sumNutrients(items.map((item) => item.nutrients));
    const recipe: Recipe = {
      id: crypto.randomUUID(),
      name: name.trim(),
      servings: count,
      ingredients: items,
      perServing: multiply(total, 1 / count),
    };
    addRecipe(recipe);
    setBanner(`Рецепт «${recipe.name}» в базе`);
    setName("");
    setItems([]);
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label="Название рецепта">
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="На сколько порций">
        <input className="field tabular-nums" inputMode="decimal" value={servings} onChange={(event) => setServings(event.target.value)} />
      </Field>
      <input className="field" placeholder="Ингредиент" aria-label="Ингредиент" value={query} onChange={(event) => { setQuery(event.target.value); setPicked(null); }} />
      {hits.length > 0 && !picked ? (
        <ul className="flex flex-col gap-2">
          {hits.map((food) => (
            <li key={food.id}>
              <button type="button" className="card w-full px-4 py-3 text-left" onClick={() => setPicked(food)}>
                {food.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {picked ? (
        <div className="flex gap-2">
          <input className="field tabular-nums" aria-label="Граммы ингредиента" value={grams} onChange={(event) => setGrams(event.target.value)} />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={() => {
              const amount = num(grams);
              if (amount <= 0) return;
              setItems((prev) => [...prev, { name: picked.name, grams: amount, nutrients: scaleNutrients(picked.per100, amount) }]);
              setPicked(null);
              setQuery("");
            }}
          >
            Добавить
          </button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2 text-sm">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
            <span>
              {item.name} · {fmt(item.grams, 0)} г
            </span>
            <button type="button" className="text-muted" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>
              убрать
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={save} disabled={!name.trim() || items.length === 0}>
        Сохранить рецепт
      </button>
      {recipes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {recipes.map((recipe) => (
            <li key={recipe.id} className="card flex items-center justify-between px-4 py-3 text-sm">
              <span>
                {recipe.name}
                <span className="block text-muted">{fmt(recipe.perServing.kcal)} ккал / порция</span>
              </span>
              <button type="button" className="text-muted" onClick={() => removeRecipe(recipe.id)}>
                удалить
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function trimNum(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
}

function num(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
