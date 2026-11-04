import { useState } from "react";
import { ChevronLeft, ChevronRight, Droplets, Plus, Sparkles, Trash2 } from "lucide-react";
import { askMotivation } from "@/lib/ai";
import { fmt, fmtDay } from "@/lib/format";
import {
  dayKey,
  dayTotals,
  fastingClock,
  formatMinutes,
  macroTargets,
  metKcal,
  motivationTone,
  proteinGoal,
  stepsKcal,
  streakInfo,
  targetForDate,
  weightTrend,
} from "@/lib/nutrition";
import { fallbackPhrase } from "@/lib/phrases";
import { useForma } from "@/lib/store";
import type { ActivityKind, MealSlot } from "@/lib/types";
import { Bar, Card, mealLabel, meals } from "@/components/forma/bits";

const WORKOUTS: { kind: Exclude<ActivityKind, "steps" | "custom">; label: string; met: number }[] = [
  { kind: "walk", label: "Ходьба", met: 3.5 },
  { kind: "run", label: "Бег", met: 9 },
  { kind: "strength", label: "Силовая", met: 5 },
  { kind: "cycle", label: "Велосипед", met: 7 },
  { kind: "yoga", label: "Йога", met: 2.5 },
];

export function TodayScreen() {
  const profile = useForma((state) => state.profile);
  const date = useForma((state) => state.selectedDate);
  const logs = useForma((state) => state.logs);
  const activities = useForma((state) => state.activities);
  const water = useForma((state) => state.water);
  const fasting = useForma((state) => state.fasting);
  const adaptive = useForma((state) => state.adaptive);
  const motivation = useForma((state) => state.motivation);
  const weights = useForma((state) => state.weights);
  const shiftDate = useForma((state) => state.shiftDate);
  const setDate = useForma((state) => state.setDate);
  const removeLog = useForma((state) => state.removeLog);
  const addWater = useForma((state) => state.addWater);
  const addActivity = useForma((state) => state.addActivity);
  const removeActivity = useForma((state) => state.removeActivity);
  const setTab = useForma((state) => state.setTab);
  const setPendingMeal = useForma((state) => state.setPendingMeal);
  const setMotivation = useForma((state) => state.setMotivation);
  const setBanner = useForma((state) => state.setBanner);
  const revertAdaptive = useForma((state) => state.revertAdaptive);
  const dismissNotice = useForma((state) => state.dismissNotice);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [customKcal, setCustomKcal] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [now, setNow] = useState(() => new Date());

  if (!profile) return null;
  const today = dayKey();
  const totals = dayTotals(logs, activities, date);
  const target = targetForDate(profile, adaptive, fasting, date);
  const left = target - totals.net;
  const streak = streakInfo(profile, adaptive, fasting, logs, activities, today);
  const macros = macroTargets(profile, target);
  const dayLogs = logs.filter((item) => item.date === date);
  const dayMoves = activities.filter((item) => item.date === date);
  const drunk = water[date] ?? 0;
  const clock = fastingClock(fasting, now);
  const phrase = motivation?.date === date ? motivation.text : null;

  const openFood = (meal: MealSlot) => {
    setPendingMeal(meal);
    setTab("food");
  };

  const speak = async () => {
    if (busy) return;
    const tone = motivationTone(streak);
    const cached = motivation && motivation.date === today ? motivation : null;
    if (cached && cached.count >= 3) {
      setBanner("На сегодня хватит трёх фраз.");
      return;
    }
    setBusy(true);
    const context = {
      tone,
      streak: streak.ongoing,
      before: streak.beforeToday,
      net: totals.net,
      target,
      protein: totals.food.protein,
      proteinGoal: proteinGoal(profile),
      trend: weightTrend(weights),
    };
    const result = await askMotivation({ data: context });
    if (result.ok) {
      setMotivation({ date: today, text: result.text, count: (cached?.count ?? 0) + 1, fromGrok: true });
    } else {
      setMotivation({
        date: today,
        text: fallbackPhrase(tone, today + tone),
        count: cached?.count ?? 0,
        fromGrok: false,
      });
      setBanner("Фраза дня недоступна, показана запасная фраза.");
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-3 px-5 pt-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Форма</p>
          <h1 className="font-display text-3xl leading-tight">{fmtDay(date)}</h1>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted">Серия</p>
          <p className="font-display text-3xl tabular-nums">{streak.ongoing}</p>
        </div>
      </header>
      <div className="flex items-center justify-between">
        <button type="button" className="flex size-11 items-center justify-center rounded-md bg-surface-2" aria-label="Предыдущий день" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" className="text-sm font-semibold text-muted" onClick={() => setDate(today)}>
          Сегодня
        </button>
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-md bg-surface-2 disabled:opacity-40"
          aria-label="Следующий день"
          disabled={date >= today}
          onClick={() => shiftDate(1)}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {adaptive.notice ? (
        <Card>
          <p className="text-sm">{adaptive.notice}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-ghost h-11 flex-1" onClick={revertAdaptive}>
              Вернуть
            </button>
            <button type="button" className="btn btn-primary h-11 flex-1" onClick={dismissNotice}>
              Оставить
            </button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="grid grid-cols-3 gap-2">
          <Ring
            value={Math.max(0, totals.net)}
            max={target}
            label="Калории"
            caption={`${fmt(totals.net)} / ${fmt(target)}`}
            color="var(--color-primary)"
          />
          <Ring
            value={totals.food.protein}
            max={macros.protein}
            label="Белок"
            caption={`${fmt(totals.food.protein)} / ${macros.protein} г`}
            color="#e2b15a"
          />
          <Ring
            value={drunk}
            max={profile.waterGoalMl}
            label="Вода"
            caption={`${glassCount(drunk)} / ${glassesDue(profile.waterGoalMl)}`}
            color="#6eb3c9"
          />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <Stat label="Съедено" value={fmt(totals.food.kcal)} />
          <Stat label="Активность" value={`−${fmt(totals.active)}`} />
          <Stat label={left >= 0 ? "Осталось" : "Сверх"} value={fmt(Math.abs(left))} />
        </dl>
        <p className="mt-3 text-sm text-muted">Кольцо калорий — факт после активности. Цель {fmt(target)} ккал.</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <Bar label={`Белки ${fmt(totals.food.protein, 0)} / ${macros.protein} г`} value={totals.food.protein} max={macros.protein} />
        <Bar label={`Жиры ${fmt(totals.food.fat, 0)} / ${macros.fat} г`} value={totals.food.fat} max={macros.fat} />
        <Bar label={`Углеводы ${fmt(totals.food.carbs, 0)} / ${macros.carbs} г`} value={totals.food.carbs} max={macros.carbs} />
        <Bar label={`Клетчатка ${fmt(totals.food.fiber, 1)} / ${macros.fiber} г`} value={totals.food.fiber} max={macros.fiber} />
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Фраза дня</p>
            <p className="mt-1">{phrase ?? "Короткая фраза по сегодняшнему дню, через DeepSeek."}</p>
          </div>
          <button type="button" className="btn btn-primary h-11 shrink-0 px-3" onClick={() => void speak()} disabled={busy}>
            <Sparkles className="size-4" />
            {busy ? "…" : phrase ? "Ещё" : "Спросить"}
          </button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Droplets className="size-5 text-[#6eb3c9]" />
            <div>
              <p className="font-semibold">Вода</p>
              <p className="text-sm tabular-nums text-muted">
                {glassCount(drunk)} из {glassesDue(profile.waterGoalMl)} {glassesWord(glassesDue(profile.waterGoalMl))} · стакан {GLASS_ML} мл
              </p>
            </div>
          </div>
          <p className="tabular-nums text-sm text-muted">
            {fmt(drunk)} / {fmt(profile.waterGoalMl)}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {Array.from({ length: glassesDue(profile.waterGoalMl) }, (_, index) => {
            const fill = Math.max(0, Math.min(1, (drunk - index * GLASS_ML) / GLASS_ML));
            const next = fill >= 1 ? index * GLASS_ML : (index + 1) * GLASS_ML;
            return (
              <button
                key={index}
                type="button"
                className="flex flex-col items-center gap-1 rounded-lg py-1 text-[#6eb3c9]"
                aria-label={fill >= 1 ? `Убрать до стакана ${index}` : `Выпить стакан ${index + 1}`}
                onClick={() => addWater(date, next - drunk)}
              >
                <Glass fill={fill} label={`g-${date}-${index}`} />
                <span className="text-[10px] tabular-nums text-muted">{index + 1}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted">Нажмите пустой стакан — он засчитается. Нажмите полный — уберётся он и следующие.</p>
      </Card>

      {fasting.enabled ? (
        <Card>
          <p className="text-sm text-muted">Голодание</p>
          {fasting.protocol === "5-2" ? (
            <p className="mt-1">
              {fasting.fastDays.includes(new Date(`${date}T12:00:00`).getDay())
                ? `Разгрузочный день, цель ${fmt(target)} ккал.`
                : "Сегодня обычный день 5:2."}
            </p>
          ) : clock ? (
            <p className="mt-1 font-display text-2xl">
              {clock.phase === "eat" ? "Окно питания" : "Голодание"} · {formatMinutes(clock.minutesLeft)}
            </p>
          ) : null}
          <button type="button" className="mt-2 text-sm text-muted" onClick={() => setNow(new Date())}>
            Обновить таймер
          </button>
        </Card>
      ) : null}

      <Card>
        <p className="font-semibold">Активность</p>
        <p className="mt-1 text-sm text-muted">Браузер не читает Apple Health. Запись вручную всё равно вычитается из рациона.</p>
        <div className="mt-3 flex gap-2">
          <input
            className="field tabular-nums"
            inputMode="numeric"
            placeholder="Шаги"
            aria-label="Шаги"
            value={steps}
            onChange={(event) => setSteps(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={() => {
              const count = Number(steps);
              if (!count || count < 1) return;
              const kcal = stepsKcal(count, profile.weightKg);
              addActivity({ date, kind: "steps", label: "Шаги", kcal, detail: `${fmt(count)} шагов` });
              setSteps("");
              setBanner(`Шаги: −${fmt(kcal)} ккал`);
            }}
          >
            Записать
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {WORKOUTS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className="chip"
              onClick={() => {
                const mins = Number(minutes) || 30;
                const kcal = metKcal(item.met, profile.weightKg, mins);
                addActivity({ date, kind: item.kind, label: item.label, kcal, detail: `${mins} мин` });
                setBanner(`${item.label}: −${fmt(kcal)} ккал`);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-muted">
          Минуты
          <input className="field tabular-nums" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </label>
        <div className="mt-3 grid grid-cols-[1fr_6rem_auto] gap-2">
          <input className="field" placeholder="Своё" aria-label="Своя тренировка" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} />
          <input className="field tabular-nums" inputMode="numeric" placeholder="ккал" aria-label="Калории тренировки" value={customKcal} onChange={(event) => setCustomKcal(event.target.value)} />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const kcal = Number(customKcal);
              if (!kcal) return;
              addActivity({ date, kind: "custom", label: customLabel.trim() || "Тренировка", kcal, detail: "вручную" });
              setCustomKcal("");
              setCustomLabel("");
            }}
          >
            Ок
          </button>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {dayMoves.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {item.label}
                <span className="text-muted"> · {item.detail}</span>
              </span>
              <span className="flex items-center gap-2 tabular-nums">
                −{fmt(item.kcal)}
                <button type="button" aria-label="Удалить активность" onClick={() => removeActivity(item.id)}>
                  <Trash2 className="size-4 text-muted" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Еда</h2>
        <button type="button" className="btn btn-primary h-11" onClick={() => openFood(useForma.getState().pendingMeal)}>
          <Plus className="size-4" />
          Добавить
        </button>
      </div>
      {dayLogs.length === 0 ? (
        <Card>
          <p>День пока пуст.</p>
          <p className="mt-1 text-sm text-muted">Поиск, штрихкод, фото, голос или свой рецепт — на вкладке «Еда».</p>
        </Card>
      ) : (
        meals().map((meal) => {
          const items = dayLogs.filter((item) => item.meal === meal.id);
          if (!items.length) return null;
          const kcal = items.reduce((sum, item) => sum + item.nutrients.kcal, 0);
          return (
            <Card key={meal.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-semibold">{meal.label}</h3>
                <span className="tabular-nums text-sm text-muted">{fmt(kcal)} ккал</span>
              </div>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <span>
                      {item.name}
                      <span className="block text-muted">
                        {item.amountLabel} · Б {fmt(item.nutrients.protein, 0)} Ж {fmt(item.nutrients.fat, 0)} У {fmt(item.nutrients.carbs, 0)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {fmt(item.nutrients.kcal)}
                      <button type="button" aria-label={`Удалить ${item.name}`} onClick={() => removeLog(item.id)}>
                        <Trash2 className="size-4 text-muted" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => openFood(meal.id)}>
                Ещё в {mealLabel(meal.id).toLowerCase()}
              </button>
            </Card>
          );
        })
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums font-semibold">{value}</dd>
    </div>
  );
}

function Ring({
  value,
  max,
  label,
  caption,
  color,
}: {
  value: number;
  max: number;
  label: string;
  caption: string;
  color: string;
}) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <svg viewBox="0 0 72 72" className="size-[4.5rem]" aria-hidden="true">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--color-track)" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ}`}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs tabular-nums text-muted">{caption}</p>
    </div>
  );
}

const GLASS_ML = 200;

function glassesDue(goalMl: number): number {
  return Math.max(1, Math.round(goalMl / GLASS_ML));
}

function glassCount(ml: number): string {
  const value = ml / GLASS_ML;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(".", ",");
}

function glassesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "стакан";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "стакана";
  return "стаканов";
}

function Glass({ fill, label }: { fill: number; label: string }) {
  const height = 36 * fill;
  return (
    <svg viewBox="0 0 36 48" className="h-12 w-9" aria-hidden="true">
      <defs>
        <clipPath id={label}>
          <path d="M8 4h20l-2.4 36H10.4Z" />
        </clipPath>
      </defs>
      <path d="M8 4h20l-2.4 36H10.4Z" fill="var(--color-track)" />
      <rect x="6" y={40 - height} width="24" height={height} fill="currentColor" clipPath={`url(#${label})`} />
      <path d="M8 4h20l-2.4 36H10.4Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
