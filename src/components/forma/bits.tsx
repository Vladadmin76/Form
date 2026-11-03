import type { ReactNode } from "react";
import type { MealSlot } from "@/lib/types";

const MEALS: { id: MealSlot; label: string }[] = [
  { id: "breakfast", label: "Завтрак" },
  { id: "lunch", label: "Обед" },
  { id: "dinner", label: "Ужин" },
  { id: "snack", label: "Перекус" },
];

export function mealLabel(id: MealSlot): string {
  return MEALS.find((item) => item.id === id)?.label ?? id;
}

export function meals(): { id: MealSlot; label: string }[] {
  return MEALS;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card p-4 ${className}`}>{children}</section>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-muted">
      {label}
      {children}
    </label>
  );
}

export function MealPicker({ value, onChange }: { value: MealSlot; onChange: (meal: MealSlot) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {MEALS.map((meal) => (
        <button
          key={meal.id}
          type="button"
          onClick={() => onChange(meal.id)}
          className={`h-11 rounded-md text-sm font-semibold ${value === meal.id ? "bg-primary text-primary-fg" : "bg-surface-2 text-fg"}`}
        >
          {meal.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
