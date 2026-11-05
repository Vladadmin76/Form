import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayKey, dayStatus } from "@/lib/nutrition";
import { useForma } from "@/lib/store";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const keyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Календарь выбора дня: отметки под числами показывают, где есть записи о еде и как закончился день.
export function CalendarSheet({ selected, onPick, onClose }: { selected: string; onPick: (date: string) => void; onClose: () => void }) {
  const profile = useForma((state) => state.profile);
  const logs = useForma((state) => state.logs);
  const activities = useForma((state) => state.activities);
  const fasting = useForma((state) => state.fasting);
  const adaptive = useForma((state) => state.adaptive);
  const today = dayKey();
  const [ty, tmRaw] = today.split("-").map(Number);
  const tm = tmRaw - 1;
  const [sy, smRaw] = selected.split("-").map(Number);
  const [view, setView] = useState({ y: sy, m: smRaw - 1 });
  const [pickMonth, setPickMonth] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  const canNext = view.y * 12 + view.m < ty * 12 + tm;

  const marks = useMemo(() => {
    const result: Record<number, "good" | "slip"> = {};
    if (!profile) return result;
    for (let d = 1; d <= count; d += 1) {
      const date = keyOf(view.y, view.m, d);
      if (date > today) break;
      const status = dayStatus(profile, adaptive, fasting, logs, activities, date, today);
      if (status === "good" || status === "slip") result[d] = status;
    }
    return result;
  }, [profile, adaptive, fasting, logs, activities, view, count, today]);

  const shiftMonth = (delta: number) => {
    const total = view.y * 12 + view.m + delta;
    setView({ y: Math.floor(total / 12), m: total % 12 });
  };

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Календарь">
      <button type="button" aria-label="Закрыть календарь" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-3xl border border-b-0 border-border bg-surface px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        {pickMonth ? (
          <>
            <div className="flex items-center justify-between">
              <button type="button" className="flex size-11 items-center justify-center rounded-md bg-surface-2" aria-label="Предыдущий год" onClick={() => setView({ ...view, y: view.y - 1 })}>
                <ChevronLeft className="size-5" />
              </button>
              <p className="font-display text-xl tabular-nums">{view.y}</p>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-md bg-surface-2 disabled:opacity-30"
                aria-label="Следующий год"
                disabled={view.y >= ty}
                onClick={() => setView({ ...view, y: view.y + 1 })}
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {MONTHS_SHORT.map((label, index) => {
                const future = view.y * 12 + index > ty * 12 + tm;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={future}
                    className="chip w-full justify-center disabled:opacity-30"
                    data-on={view.m === index}
                    onClick={() => {
                      setView({ ...view, m: index });
                      setPickMonth(false);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button type="button" className="flex size-11 items-center justify-center rounded-md bg-surface-2" aria-label="Предыдущий месяц" onClick={() => shiftMonth(-1)}>
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" className="rounded-md px-3 py-2 font-display text-xl" aria-label="Выбрать месяц и год" onClick={() => setPickMonth(true)}>
                {MONTHS[view.m]} {view.y}
              </button>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-md bg-surface-2 disabled:opacity-30"
                aria-label="Следующий месяц"
                disabled={!canNext}
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 text-center text-xs text-muted" aria-hidden="true">
              {WEEK.map((label) => (
                <span key={label} className="py-1">
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((day, index) => {
                if (day === null) return <span key={`blank-${index}`} />;
                const date = keyOf(view.y, view.m, day);
                const future = date > today;
                const isSelected = date === selected;
                const mark = marks[day];
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={future}
                    aria-label={`${day} ${MONTHS[view.m].toLowerCase()}${mark === "good" ? ", в цели" : mark === "slip" ? ", выше цели" : ""}`}
                    aria-current={date === today ? "date" : undefined}
                    aria-pressed={isSelected}
                    className={`mx-auto flex h-12 w-11 flex-col items-center justify-center rounded-md tabular-nums disabled:opacity-30 ${
                      isSelected ? "bg-primary font-semibold text-primary-fg" : date === today ? "ring-1 ring-primary" : ""
                    }`}
                    onClick={() => onPick(date)}
                  >
                    <span>{day}</span>
                    <span className={`mt-0.5 size-1.5 rounded-full ${mark === "good" ? "bg-emerald-400" : mark === "slip" ? "bg-rose-400" : "bg-transparent"}`} />
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex items-center justify-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400" /> в цели
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-rose-400" /> выше цели
              </span>
              <span>без точки — записей нет</span>
            </p>
          </>
        )}
        <button type="button" className="btn btn-ghost mt-3 w-full" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
