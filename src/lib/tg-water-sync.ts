// Вода из Telegram: приложение забирает записи, которые пришли от бота, и сообщает серверу
// «сегодня выпито / цель» (нужно боту для ответов и «умных» напоминаний).
import { dayKey } from "@/lib/nutrition";
import { useForma } from "@/lib/store";
import { isLinked, linkedState, setLinked, tgStatus, tgWater } from "@/lib/tg-client";

const APPLIED = "forma-tg-applied";
let running = false;
let probed = false;

function loadApplied(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(APPLIED) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

function saveApplied(ids: number[]) {
  try {
    localStorage.setItem(APPLIED, JSON.stringify(ids.slice(-200)));
  } catch {
    // Хранилище недоступно: при повторной доставке запись может добавиться дважды, но подтверждение уйдёт на сервер.
  }
}

export async function syncWater(): Promise<void> {
  if (running) return;
  const profile = useForma.getState().profile;
  if (!profile) return;
  running = true;
  try {
    // Статус подключения ещё неизвестен (бота подключили до этой версии): один раз спрашиваем сервер.
    if (linkedState() === null && !probed) {
      probed = true;
      const status = await tgStatus();
      if (status.data?.available) setLinked(Boolean(status.data.connected));
    }
    if (!isLinked()) return;
    const report = (ack: number[]) => {
      const today = dayKey();
      return tgWater({ day: today, ml: useForma.getState().water[today] ?? 0, goal: profile.waterGoalMl, ack });
    };
    const first = await report([]);
    if (first.status === 404) {
      setLinked(false);
      return;
    }
    const events = first.data?.events ?? [];
    if (events.length === 0) return;
    // Каждую запись добавляем один раз: уже добавленные запоминаем, даже если подтверждение не дошло.
    const applied = new Set(loadApplied());
    for (const event of events) {
      if (applied.has(event.id)) continue;
      useForma.getState().addWater(event.day, event.ml);
      applied.add(event.id);
    }
    saveApplied([...applied]);
    await report(events.map((event) => event.id));
  } finally {
    running = false;
  }
}
