import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  addDays,
  baseTarget,
  dayKey,
  daysBetween,
  previewAdaptive,
  roundNutrients,
  scaleNutrients,
  suggestMeal,
  waterGoalFor,
} from "@/lib/nutrition";
import type {
  ActivityEntry,
  AdaptiveState,
  Fasting,
  FoodItem,
  LogEntry,
  MealSlot,
  MotivationState,
  Nutrients,
  Profile,
  Recipe,
  Reminder,
  TabId,
  WeightEntry,
} from "@/lib/types";

export type BackupV1 = {
  version: 1;
  profile: Profile | null;
  weights: WeightEntry[];
  logs: LogEntry[];
  activities: ActivityEntry[];
  water: Record<string, number>;
  customFoods: FoodItem[];
  recipes: Recipe[];
  fasting: Fasting;
  reminders: Reminder[];
  adaptive: AdaptiveState;
  motivation: MotivationState;
  firedReminders: string[];
  pieceWeights: Record<string, number>;
  pieceKcals: Record<string, number>;
};

const defaultFasting = (): Fasting => ({
  enabled: false,
  protocol: "16-8",
  eatingStart: "12:00",
  eatingHours: 8,
  fastDays: [1, 4],
});

const defaultReminders = (): Reminder[] => [
  { id: "breakfast", label: "Завтрак", time: "08:30", enabled: false },
  { id: "lunch", label: "Обед", time: "13:30", enabled: false },
  { id: "dinner", label: "Ужин", time: "19:00", enabled: false },
];

const defaultAdaptive = (today = dayKey()): AdaptiveState => ({
  lastApplied: today,
  target: null,
  notice: null,
  previousTarget: null,
});

function uid(): string {
  return crypto.randomUUID();
}

type Data = BackupV1;

type Ui = {
  tab: TabId;
  selectedDate: string;
  pendingMeal: MealSlot;
  banner: string | null;
};

type Actions = {
  setTab: (tab: TabId) => void;
  setDate: (date: string) => void;
  shiftDate: (delta: number) => void;
  setPendingMeal: (meal: MealSlot) => void;
  setBanner: (banner: string | null) => void;
  saveProfile: (profile: Profile, opts?: { asNew?: boolean }) => void;
  addWeight: (date: string, kg: number) => void;
  removeWeight: (id: string) => void;
  addLog: (entry: Omit<LogEntry, "id">) => void;
  removeLog: (id: string) => void;
  addWater: (date: string, ml: number) => void;
  addActivity: (entry: Omit<ActivityEntry, "id">) => void;
  removeActivity: (id: string) => void;
  addCustomFood: (food: FoodItem) => void;
  saveFoodProfile: (food: FoodItem, per100: Nutrients) => void;
  rememberPiece: (key: string, amount: number, unit: "g" | "kcal", foodId?: string) => void;
  removeCustomFood: (id: string) => void;
  addRecipe: (recipe: Recipe) => void;
  removeRecipe: (id: string) => void;
  setFasting: (fasting: Fasting) => void;
  setWaterGoal: (ml: number) => void;
  setReminders: (reminders: Reminder[]) => void;
  markFired: (key: string) => void;
  setMotivation: (motivation: MotivationState) => void;
  applyAdaptive: (force: boolean) => string | null;
  revertAdaptive: () => void;
  dismissNotice: () => void;
  exportBackup: () => BackupV1;
  importBackup: (data: BackupV1) => void;
  resetAll: () => void;
};

const emptyData = (): Data => ({
  version: 1,
  profile: null,
  weights: [],
  logs: [],
  activities: [],
  water: {},
  customFoods: [],
  recipes: [],
  fasting: defaultFasting(),
  reminders: defaultReminders(),
  adaptive: defaultAdaptive(),
  motivation: null,
  firedReminders: [],
  pieceWeights: {},
  pieceKcals: {},
});

export const useForma = create<Data & Ui & Actions>()(
  persist(
    (set, get) => ({
      ...emptyData(),
      tab: "today",
      selectedDate: dayKey(),
      pendingMeal: suggestMeal(),
      banner: null,
      setTab: (tab) => set({ tab }),
      setDate: (selectedDate) => set({ selectedDate }),
      shiftDate: (delta) => {
        const today = dayKey();
        const next = addDays(get().selectedDate, delta);
        if (next > today) return;
        set({ selectedDate: next });
      },
      setPendingMeal: (pendingMeal) => set({ pendingMeal }),
      setBanner: (banner) => set({ banner }),
      saveProfile: (profile, opts) => {
        const today = dayKey();
        const prev = get().profile;
        const bodyChanged =
          !prev ||
          opts?.asNew ||
          prev.weightKg !== profile.weightKg ||
          prev.heightCm !== profile.heightCm ||
          prev.age !== profile.age ||
          prev.sex !== profile.sex ||
          prev.activity !== profile.activity ||
          prev.deficitKcal !== profile.deficitKcal;
        const weights = upsertWeight(get().weights, today, profile.weightKg);
        set({
          profile,
          weights,
          adaptive: bodyChanged ? defaultAdaptive(today) : get().adaptive,
        });
      },
      addWeight: (date, kg) => set({ weights: upsertWeight(get().weights, date, kg) }),
      removeWeight: (id) => set({ weights: get().weights.filter((item) => item.id !== id) }),
      addLog: (entry) => set({ logs: [{ ...entry, id: uid() }, ...get().logs] }),
      removeLog: (id) => set({ logs: get().logs.filter((item) => item.id !== id) }),
      addWater: (date, ml) => {
        const current = get().water[date] ?? 0;
        const next = Math.max(0, Math.min(8000, current + ml));
        set({ water: { ...get().water, [date]: next } });
      },
      addActivity: (entry) => set({ activities: [{ ...entry, id: uid() }, ...get().activities] }),
      removeActivity: (id) => set({ activities: get().activities.filter((item) => item.id !== id) }),
      addCustomFood: (food) => set({ customFoods: [food, ...get().customFoods.filter((item) => item.id !== food.id)] }),
      saveFoodProfile: (food, per100) => {
        const next = roundNutrients(per100);
        const list = get().customFoods;
        const index = list.findIndex((item) => item.id === food.id || (food.barcode && item.barcode === food.barcode));
        if (index >= 0) {
          const customFoods = list.slice();
          customFoods[index] = { ...customFoods[index], per100: next, custom: true };
          set({ customFoods });
          return;
        }
        set({ customFoods: [{ ...food, per100: next, custom: true, id: food.id || uid() }, ...list] });
      },
      rememberPiece: (key, amount, unit, foodId) => {
        if (!key || !(amount > 0)) return;
        const piece = unit === "kcal" ? Math.round(amount) : Math.round(amount * 10) / 10;
        const pieceWeights = { ...get().pieceWeights };
        const pieceKcals = { ...get().pieceKcals };
        if (unit === "kcal") {
          pieceKcals[key] = piece;
          delete pieceWeights[key];
        } else {
          pieceWeights[key] = piece;
          delete pieceKcals[key];
        }
        set({
          pieceWeights,
          pieceKcals,
          customFoods: get().customFoods.map((item) =>
            item.id === foodId || item.id === key || item.barcode === key
              ? unit === "kcal"
                ? { ...item, pieceKcal: piece, pieceGrams: undefined }
                : { ...item, pieceGrams: piece, pieceKcal: undefined }
              : item,
          ),
        });
      },
      removeCustomFood: (id) => set({ customFoods: get().customFoods.filter((item) => item.id !== id) }),
      addRecipe: (recipe) => set({ recipes: [recipe, ...get().recipes.filter((item) => item.id !== recipe.id)] }),
      removeRecipe: (id) => set({ recipes: get().recipes.filter((item) => item.id !== id) }),
      setFasting: (fasting) => set({ fasting }),
      setWaterGoal: (ml) => {
        const profile = get().profile;
        if (!profile) return;
        set({ profile: { ...profile, waterGoalMl: ml } });
      },
      setReminders: (reminders) => set({ reminders }),
      markFired: (key) => {
        const today = dayKey();
        const keep = get().firedReminders.filter((item) => item.endsWith(today) || item.endsWith(addDays(today, -1)));
        set({ firedReminders: [...keep, key] });
      },
      setMotivation: (motivation) => set({ motivation }),
      applyAdaptive: (force) => {
        const state = get();
        if (!state.profile) return "Сначала заполните профиль.";
        const today = dayKey();
        if (!force && state.adaptive.lastApplied && daysBetween(state.adaptive.lastApplied, today) < 7) {
          return null;
        }
        const current = baseTarget(state.profile, state.adaptive.target);
        const preview = previewAdaptive({
          profile: state.profile,
          weights: state.weights,
          logs: state.logs,
          currentTarget: current,
        });
        if (!preview.ok) return force ? preview.reason : null;
        if (preview.target === current) {
          set({ adaptive: { ...state.adaptive, lastApplied: today, notice: null } });
          return force ? "Цель уже совпадает с трендом веса." : null;
        }
        const sign = preview.deltaKg > 0 ? "+" : "";
        set({
          adaptive: {
            lastApplied: today,
            target: preview.target,
            previousTarget: state.adaptive.target,
            notice: `Цель по тренду веса: ${preview.from} → ${preview.target} ккал. За ${preview.days} дн. вес ${sign}${preview.deltaKg} кг, оценка расхода ${preview.tdee} ккал.`,
          },
        });
        return null;
      },
      revertAdaptive: () => {
        const adaptive = get().adaptive;
        set({
          adaptive: {
            ...adaptive,
            target: adaptive.previousTarget,
            previousTarget: null,
            notice: null,
          },
        });
      },
      dismissNotice: () => set({ adaptive: { ...get().adaptive, notice: null } }),
      exportBackup: () => {
        const state = get();
        return {
          version: 1,
          profile: state.profile,
          weights: state.weights,
          logs: state.logs,
          activities: state.activities,
          water: state.water,
          customFoods: state.customFoods,
          recipes: state.recipes,
          fasting: state.fasting,
          reminders: state.reminders,
          adaptive: state.adaptive,
          motivation: state.motivation,
          firedReminders: state.firedReminders,
          pieceWeights: state.pieceWeights,
          pieceKcals: state.pieceKcals,
        };
      },
      importBackup: (data) =>
        set({
          profile: data.profile,
          weights: data.weights,
          logs: data.logs,
          activities: data.activities,
          water: data.water,
          customFoods: data.customFoods,
          recipes: data.recipes,
          fasting: data.fasting ?? defaultFasting(),
          reminders: data.reminders ?? defaultReminders(),
          adaptive: data.adaptive ?? defaultAdaptive(),
          motivation: data.motivation ?? null,
          firedReminders: data.firedReminders ?? [],
          pieceWeights: data.pieceWeights ?? {},
          pieceKcals: data.pieceKcals ?? {},
        }),
      resetAll: () =>
        set({
          ...emptyData(),
          tab: "today",
          selectedDate: dayKey(),
          pendingMeal: suggestMeal(),
          banner: null,
        }),
    }),
    {
      name: "forma-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        version: state.version,
        profile: state.profile,
        weights: state.weights,
        logs: state.logs,
        activities: state.activities,
        water: state.water,
        customFoods: state.customFoods,
        recipes: state.recipes,
        fasting: state.fasting,
        reminders: state.reminders,
        adaptive: state.adaptive,
        motivation: state.motivation,
        firedReminders: state.firedReminders,
        pieceWeights: state.pieceWeights,
        pieceKcals: state.pieceKcals,
      }),
    },
  ),
);

function upsertWeight(weights: WeightEntry[], date: string, kg: number): WeightEntry[] {
  const rest = weights.filter((item) => item.date !== date);
  return [...rest, { id: uid(), date, kg }].sort((a, b) => a.date.localeCompare(b.date));
}

export function recipePortion(recipe: Recipe, servings: number) {
  return scaleNutrients(
    {
      ...recipe.perServing,
    },
    servings * 100,
  );
}

export function parseBackup(raw: unknown): BackupV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<BackupV1>;
  if (data.version !== 1) return null;
  if (data.profile !== null && (typeof data.profile !== "object" || !data.profile)) return null;
  if (data.profile && typeof data.profile.weightKg !== "number") return null;
  if (!Array.isArray(data.weights) || !Array.isArray(data.logs) || !Array.isArray(data.activities)) return null;
  if (!data.water || typeof data.water !== "object") return null;
  return {
    version: 1,
    profile: data.profile ?? null,
    weights: data.weights,
    logs: data.logs,
    activities: data.activities,
    water: data.water as Record<string, number>,
    customFoods: Array.isArray(data.customFoods) ? data.customFoods : [],
    recipes: Array.isArray(data.recipes) ? data.recipes : [],
    fasting: data.fasting ?? defaultFasting(),
    reminders: data.reminders ?? defaultReminders(),
    adaptive: data.adaptive ?? defaultAdaptive(),
    motivation: data.motivation ?? null,
    firedReminders: Array.isArray(data.firedReminders) ? data.firedReminders : [],
    pieceWeights: pieceMap(data.pieceWeights),
    pieceKcals: pieceMap(data.pieceKcals),
  };
}

function pieceMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && value > 0 && value < 5000) out[key] = value;
  }
  return out;
}
