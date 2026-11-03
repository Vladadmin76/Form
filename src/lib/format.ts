import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { parseDay } from "@/lib/nutrition";

export function fmt(n: number, digits = 0): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

export function cap(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function fmtDay(key: string): string {
  return cap(format(parseDay(key), "EEEE, d MMMM", { locale: ru }));
}

export function fmtShort(key: string): string {
  return format(parseDay(key), "d MMM", { locale: ru });
}
