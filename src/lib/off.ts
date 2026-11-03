import { ZERO, roundNutrients } from "@/lib/nutrition";
import type { Nutrients } from "@/lib/types";

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function toUnit(raw: number, unit: string, as: "g" | "mg" | "mcg"): number {
  if (!raw) return 0;
  let grams = raw;
  if (unit === "mg") grams = raw / 1000;
  else if (unit === "µg" || unit === "ug" || unit === "mcg") grams = raw / 1e6;
  else if (unit === "kg") grams = raw * 1000;
  if (as === "g") return grams;
  if (as === "mg") return grams * 1000;
  return grams * 1e6;
}

function take(n: Record<string, unknown>, key: string, as: "g" | "mg" | "mcg"): number {
  return toUnit(num(n[`${key}_100g`]), String(n[`${key}_unit`] ?? "g"), as);
}

export type OffHit = { name: string; per100: Nutrients; pieceGrams?: number };

function servingGrams(product: Record<string, unknown>): number | undefined {
  const size = String(product.serving_size ?? "").trim();
  const written = size.match(/(\d+(?:[.,]\d+)?)\s*(?:g|гр)\b/i);
  let grams = written ? Number(written[1].replace(",", ".")) : 0;
  if (!grams) {
    const qty = num(product.serving_quantity);
    const unit = String(product.serving_quantity_unit ?? "").toLowerCase();
    if (qty > 0 && (unit === "" || unit === "g" || unit === "г" || unit === "gr" || unit === "gram" || unit === "grams")) grams = qty;
  }
  if (!grams || grams <= 0 || grams >= 2000) return undefined;
  if (/^(?:100|100[.,]0)\s*(?:g|гр)?$/i.test(size) || (!size && grams === 100)) return undefined;
  return Math.round(grams * 10) / 10;
}

export function nutrientsFromOff(product: Record<string, unknown>): OffHit | null {
  const nutriments = product.nutriments;
  if (!nutriments || typeof nutriments !== "object") return null;
  const n = nutriments as Record<string, unknown>;
  const kcal = num(n["energy-kcal_100g"]) || num(n["energy-kcal"]) || num(n.energy_100g) / 4.184;
  const name = String(product.product_name_ru || product.product_name || product.generic_name || "").trim();
  if (!name || kcal <= 0) return null;
  const per100 = roundNutrients({
    ...ZERO,
    kcal,
    protein: num(n.proteins_100g),
    fat: num(n.fat_100g),
    carbs: num(n.carbohydrates_100g),
    fiber: num(n.fiber_100g),
    iron: take(n, "iron", "mg"),
    vitD: take(n, "vitamin-d", "mcg"),
    b12: take(n, "vitamin-b12", "mcg"),
    omega3: num(n["omega-3-fat_100g"]),
    calcium: take(n, "calcium", "mg"),
    magnesium: take(n, "magnesium", "mg"),
    potassium: take(n, "potassium", "mg"),
    vitC: take(n, "vitamin-c", "mg"),
    zinc: take(n, "zinc", "mg"),
    folate: take(n, "folate", "mcg") || take(n, "vitamin-b9", "mcg"),
    sodium: take(n, "sodium", "mg"),
  });
  const pieceGrams = servingGrams(product);
  return pieceGrams ? { name, per100, pieceGrams } : { name, per100 };
}

export async function lookupBarcode(code: string): Promise<OffHit | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { status?: number; product?: Record<string, unknown> };
  if (body.status !== 1 || !body.product) return null;
  return nutrientsFromOff(body.product);
}
