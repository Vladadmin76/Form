export type Sex = "female" | "male";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type Tone = "good" | "slip" | "streak" | "neutral";

export type WeightTrend = "down" | "up" | "flat" | "unknown";

export type Nutrients = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  iron: number;
  vitD: number;
  b12: number;
  omega3: number;
  calcium: number;
  magnesium: number;
  potassium: number;
  vitC: number;
  zinc: number;
  folate: number;
  sodium: number;
};

export type Profile = {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: ActivityLevel;
  deficitKcal: number;
  waterGoalMl: number;
  createdAt: string;
};

export type WeightEntry = {
  id: string;
  date: string;
  kg: number;
};

export type FoodItem = {
  id: string;
  name: string;
  per100: Nutrients;
  barcode?: string;
  custom?: boolean;
  pieceGrams?: number;
  pieceKcal?: number;
};

export type LogEntry = {
  id: string;
  date: string;
  meal: MealSlot;
  name: string;
  amountLabel: string;
  nutrients: Nutrients;
};

export type RecipeIngredient = {
  name: string;
  grams: number;
  nutrients: Nutrients;
};

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  perServing: Nutrients;
};

export type ActivityKind = "steps" | "walk" | "run" | "strength" | "cycle" | "yoga" | "custom";

export type ActivityEntry = {
  id: string;
  date: string;
  kind: ActivityKind;
  label: string;
  kcal: number;
  detail: string;
};

export type FastProtocol = "16-8" | "18-6" | "20-4" | "5-2" | "custom";

export type Fasting = {
  enabled: boolean;
  protocol: FastProtocol;
  eatingStart: string;
  eatingHours: number;
  fastDays: number[];
};

export type Reminder = {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
};

export type AdaptiveState = {
  lastApplied: string | null;
  target: number | null;
  notice: string | null;
  previousTarget: number | null;
};

export type MotivationState = {
  date: string;
  text: string;
  count: number;
  fromGrok: boolean;
} | null;

export type TabId = "today" | "food" | "progress" | "profile";
