import { useEffect } from "react";
import { dayKey } from "@/lib/nutrition";
import { useForma } from "@/lib/store";
import { syncWater } from "@/lib/tg-water-sync";

// Невидимый помощник: забирает воду из Telegram при открытии, возвращении в приложение и раз в полминуты,
// а после каждого изменения воды сообщает серверу новую сумму.
export function TgWaterSync() {
  const today = dayKey();
  const drunk = useForma((state) => state.water[today] ?? 0);
  const goal = useForma((state) => state.profile?.waterGoalMl ?? 0);

  useEffect(() => {
    void syncWater();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncWater();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(onVisible, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void syncWater(), 1500);
    return () => window.clearTimeout(id);
  }, [drunk, goal, today]);

  return null;
}
