import { useEffect, useState } from "react";
import { ChartLine, Salad, UserRound, Utensils } from "lucide-react";
import { dayKey, waterGoalFor } from "@/lib/nutrition";
import { useForma } from "@/lib/store";
import type { TabId } from "@/lib/types";
import { FoodScreen } from "@/components/forma/pantry";
import { KeyboardInset } from "@/components/forma/keyboard";
import { ProfileForm } from "@/components/forma/profile-form";
import { ProfileScreen } from "@/components/forma/profile";
import { ProgressScreen } from "@/components/forma/progress";
import { TgWaterSync } from "@/components/forma/tg-water-sync";
import { TodayScreen } from "@/components/forma/today";

const TABS: { id: TabId; label: string; icon: typeof Salad }[] = [
  { id: "today", label: "Сегодня", icon: Salad },
  { id: "food", label: "Еда", icon: Utensils },
  { id: "progress", label: "Прогресс", icon: ChartLine },
  { id: "profile", label: "Профиль", icon: UserRound },
];

export function FormaApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.resolve(useForma.persist.rehydrate())
      .catch(() => undefined)
      .finally(() => {
        useForma.getState().dedupeCatalog();
        setReady(true);
      });
  }, []);
  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-fg">
        <div>
          <p className="font-display text-4xl">Форма</p>
          <p className="mt-2 text-muted">Дневник питания</p>
        </div>
      </main>
    );
  }
  return <Ready />;
}

// Подтверждения действий: крупный «+210 ккал» / «−28 ккал» на секунду, потом исчезает.
// Остальные сообщения (напоминания, ошибки) показываются плашкой чуть дольше, закрываются касанием.
function Toast() {
  const banner = useForma((state) => state.banner);
  const seq = useForma((state) => state.bannerSeq);
  const setBanner = useForma((state) => state.setBanner);
  const big = banner ? /^[+−-]/.test(banner) : false;
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), big ? 1300 : 4000);
    return () => window.clearTimeout(id);
  }, [banner, seq, big, setBanner]);
  if (!banner) return null;
  const [head, ...rest] = banner.split("\n");
  if (big) {
    return (
      <div key={seq} role="status" aria-live="polite" className="toast-pop pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6" style={{ animationDuration: "1.3s" }}>
        <div className="rounded-3xl border border-border bg-surface/95 px-8 py-5 text-center shadow-2xl">
          <span className="block whitespace-nowrap font-display tabular-nums">
            <span className="text-6xl">{head.replace(/\s*ккал$/, "")}</span>
            {head.endsWith("ккал") ? <span className="ml-2 text-2xl text-muted">ккал</span> : null}
          </span>
          {rest.length > 0 ? <span className="mt-1 block text-sm text-muted">{rest.join(" ")}</span> : null}
        </div>
      </div>
    );
  }
  return (
    <button
      key={seq}
      type="button"
      role="status"
      aria-live="polite"
      className="toast-pop fixed inset-x-4 top-16 z-50 mx-auto max-w-md rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm shadow-2xl"
      style={{ animationDuration: "4s" }}
      onClick={() => setBanner(null)}
    >
      {banner}
    </button>
  );
}

function Ready() {
  const profile = useForma((state) => state.profile);
  const saveProfile = useForma((state) => state.saveProfile);
  const tab = useForma((state) => state.tab);
  const setTab = useForma((state) => state.setTab);
  const reminders = useForma((state) => state.reminders);

  useEffect(() => {
    useForma.getState().applyAdaptive(false);
  }, [profile]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = new Date();
      const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = dayKey(now);
      const state = useForma.getState();
      for (const reminder of state.reminders) {
        if (!reminder.enabled || reminder.time !== hm) continue;
        const key = `${reminder.id}:${today}`;
        if (state.firedReminders.includes(key)) continue;
        state.markFired(key);
        state.setBanner(reminder.label);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Форма", { body: reminder.label });
        }
      }
    }, 15000);
    return () => window.clearInterval(id);
  }, [reminders]);

  if (!profile) {
    return (
      <>
        <KeyboardInset />
        <main className="mx-auto min-h-dvh max-w-lg bg-bg px-5 pt-8 pb-[calc(2.5rem+var(--kb,0px))] text-fg">
        <p className="text-sm text-muted">Первый запуск</p>
        <h1 className="font-display text-4xl">Форма</h1>
        <p className="mt-2 text-muted">Считаем обмен по Миффлину — Сан Жеору и ваш дефицит. Дневник останется на этом устройстве.</p>
        <div className="mt-6">
          <ProfileForm
            initial={null}
            submitLabel="Начать"
            onSubmit={(next) => saveProfile({ ...next, waterGoalMl: next.waterGoalMl || waterGoalFor(next.weightKg, next.sex) }, { asNew: true })}
          />
        </div>
      </main>
      </>
    );
  }

  return (
    <>
      <KeyboardInset />
      <main className="mx-auto min-h-dvh max-w-lg bg-bg pb-[calc(7rem+var(--kb,0px))] text-fg">
      <Toast />
      <TgWaterSync />
      {tab === "today" ? <TodayScreen /> : null}
      {tab === "food" ? <FoodScreen /> : null}
      {tab === "progress" ? <ProgressScreen /> : null}
      {tab === "profile" ? <ProfileScreen /> : null}
      <nav className="tabbar fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg border-t border-border bg-bg pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map((item) => {
          const Icon = item.icon;
          const on = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${on ? "text-primary" : "text-muted"}`}
              onClick={() => setTab(item.id)}
            >
              <Icon className="size-5" strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </main>
    </>
  );
}
