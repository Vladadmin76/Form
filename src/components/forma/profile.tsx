import { useState } from "react";
import { bmi, bmiStage, dayKey } from "@/lib/nutrition";
import { listPhotos, replacePhotos, type ProgressPhoto } from "@/lib/photos";
import { parseBackup, useForma, type BackupV1 } from "@/lib/store";
import type { FastProtocol } from "@/lib/types";
import { fmt } from "@/lib/format";
import { Card, Field } from "@/components/forma/bits";
import { ProfileForm } from "@/components/forma/profile-form";
import { TelegramCard } from "@/components/forma/telegram";

const WEEK = [
  { id: 1, label: "Пн" },
  { id: 2, label: "Вт" },
  { id: 3, label: "Ср" },
  { id: 4, label: "Чт" },
  { id: 5, label: "Пт" },
  { id: 6, label: "Сб" },
  { id: 0, label: "Вс" },
];

const PROTOCOLS: { id: FastProtocol; label: string; hours: number }[] = [
  { id: "16-8", label: "16/8", hours: 8 },
  { id: "18-6", label: "18/6", hours: 6 },
  { id: "20-4", label: "20/4", hours: 4 },
  { id: "5-2", label: "5:2", hours: 8 },
  { id: "custom", label: "Своё", hours: 8 },
];

export function ProfileScreen() {
  const profile = useForma((state) => state.profile);
  const fasting = useForma((state) => state.fasting);
  const reminders = useForma((state) => state.reminders);
  const saveProfile = useForma((state) => state.saveProfile);
  const setFasting = useForma((state) => state.setFasting);
  const setReminders = useForma((state) => state.setReminders);
  const exportBackup = useForma((state) => state.exportBackup);
  const importBackup = useForma((state) => state.importBackup);
  const resetAll = useForma((state) => state.resetAll);
  const setBanner = useForma((state) => state.setBanner);
  const [confirm, setConfirm] = useState(false);
  const [withPhotos, setWithPhotos] = useState(false);
  const [fileNote, setFileNote] = useState("");

  if (!profile) return null;
  const index = bmi(profile.weightKg, profile.heightCm);
  const stage = bmiStage(index);

  const download = async () => {
    const backup: BackupV1 & { photos?: ProgressPhoto[] } = exportBackup();
    if (withPhotos) {
      try {
        backup.photos = await listPhotos();
      } catch {
        setFileNote("Фото не попали в файл, дневник сохранён.");
      }
    }
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forma-${dayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setFileNote("Файл скачан. Его можно положить в iCloud Drive вручную — браузер сам в iCloud не пишет.");
  };

  return (
    <div className="flex flex-col gap-3 px-5 pt-6">
      <header>
        <p className="text-sm text-muted">Профиль</p>
        <h1 className="font-display text-3xl">Ваша норма</h1>
      </header>
      <Card>
        <p className="font-display text-3xl tabular-nums">ИМТ {fmt(index, 1)}</p>
        <p className="mt-1 font-semibold">{stage.title}</p>
        <p className="text-sm text-muted">
          {fmt(profile.weightKg, 1)} кг · {fmt(profile.heightCm, 0)} см · {profile.age} лет · дефицит {fmt(profile.deficitKcal)} ккал
        </p>
      </Card>
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Изменить данные</summary>
        <div className="mt-4">
          <ProfileForm initial={profile} submitLabel="Сохранить" onSubmit={(next) => { saveProfile(next); setBanner("Профиль обновлён. Норма по формуле пересчитана."); }} />
        </div>
      </details>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Интервальное голодание</h2>
          <button
            type="button"
            className={`chip ${fasting.enabled ? "" : ""}`}
            data-on={fasting.enabled}
            onClick={() => setFasting({ ...fasting, enabled: !fasting.enabled })}
          >
            {fasting.enabled ? "Вкл" : "Выкл"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROTOCOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chip"
              data-on={fasting.protocol === item.id}
              onClick={() => setFasting({ ...fasting, protocol: item.id, eatingHours: item.id === "custom" ? fasting.eatingHours : item.hours })}
            >
              {item.label}
            </button>
          ))}
        </div>
        {fasting.protocol === "5-2" ? (
          <div className="mt-3">
            <p className="text-sm text-muted">Два разгрузочных дня: 500 ккал женщинам, 600 мужчинам.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEK.map((day) => {
                const on = fasting.fastDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    className="chip"
                    data-on={on}
                    onClick={() => {
                      const fastDays = on ? fasting.fastDays.filter((id) => id !== day.id) : [...fasting.fastDays, day.id];
                      setFasting({ ...fasting, fastDays });
                    }}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Окно с">
              <input className="field" type="time" value={fasting.eatingStart} onChange={(event) => setFasting({ ...fasting, eatingStart: event.target.value })} />
            </Field>
            <Field label="Часов еды">
              <input
                className="field tabular-nums"
                inputMode="decimal"
                value={String(fasting.eatingHours)}
                onChange={(event) => setFasting({ ...fasting, protocol: "custom", eatingHours: Number(event.target.value) || 8 })}
              />
            </Field>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Напоминания</h2>
        <p className="mt-1 text-sm text-muted">Срабатывают, пока дневник открыт. Чтобы приходили и при закрытом приложении, подключите Telegram ниже.</p>
        <button
          type="button"
          className="btn btn-ghost mt-3"
          onClick={() => {
            if ("Notification" in window) void Notification.requestPermission();
          }}
        >
          Разрешить уведомления
        </button>
        <ul className="mt-3 flex flex-col gap-3">
          {reminders.map((item) => (
            <li key={item.id} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
              <input
                className="field"
                aria-label="Текст напоминания"
                value={item.label}
                onChange={(event) => setReminders(reminders.map((row) => (row.id === item.id ? { ...row, label: event.target.value } : row)))}
              />
              <input
                className="field"
                type="time"
                aria-label="Время"
                value={item.time}
                onChange={(event) => setReminders(reminders.map((row) => (row.id === item.id ? { ...row, time: event.target.value } : row)))}
              />
              <button
                type="button"
                className="chip"
                data-on={item.enabled}
                onClick={() => setReminders(reminders.map((row) => (row.id === item.id ? { ...row, enabled: !row.enabled } : row)))}
              >
                {item.enabled ? "Вкл" : "Выкл"}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-primary"
          onClick={() => setReminders([...reminders, { id: crypto.randomUUID(), label: "Перекус", time: "16:00", enabled: false }])}
        >
          Ещё одно
        </button>
      </Card>

      <TelegramCard />

      <Card>
        <h2 className="font-semibold">Резервная копия</h2>
        <p className="mt-1 text-sm text-muted">Вместо iCloud — файл JSON. Дневник, вес, рецепты и настройки. Сервера у приложения нет.</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withPhotos} onChange={(event) => setWithPhotos(event.target.checked)} />
          Включить фото прогресса
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void download()}>
            Скачать
          </button>
          <label className="btn btn-ghost">
            Восстановить
            <input
              className="sr-only"
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then(async (text) => {
                  try {
                    const parsed = parseBackup(JSON.parse(text));
                    if (!parsed) {
                      setFileNote("Это не копия Формы.");
                      return;
                    }
                    importBackup(parsed);
                    const photos = (JSON.parse(text) as { photos?: ProgressPhoto[] }).photos;
                    if (Array.isArray(photos)) await replacePhotos(photos.filter((item) => item && typeof item.dataUrl === "string"));
                    setFileNote("Копия восстановлена на этом устройстве.");
                  } catch {
                    setFileNote("Файл не читается.");
                  }
                });
              }}
            />
          </label>
        </div>
        {fileNote ? <p className="mt-2 text-sm text-muted">{fileNote}</p> : null}
      </Card>

      <Card>
        <h2 className="font-semibold">Как это устроено</h2>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-4 text-sm text-muted">
          <li>Норма: Миффлин — Сан Жеор, затем коэффициент активности, затем ваш дефицит.</li>
          <li>Шаги и тренировки вводятся вручную: веб-страница не видит Apple Health. Калории активности вычитаются так же.</li>
          <li>Голос — микрофон браузера, не системный Speech в приложении iOS.</li>
          <li>Штрихкод ищется локально, неизвестный — в Open Food Facts. Сам дневник никуда не отправляется.</li>
          <li>Фраза дня берёт цифры за вчера (калории, белок, серия, без имени), фото блюда уходит только по кнопке. Обрабатывает внешний сервис ИИ.</li>
          <li>Ориентиры, не назначение и не диагноз.</li>
        </ul>
      </Card>

      {confirm ? (
        <Card>
          <p>Стереть дневник, вес и профиль на этом устройстве?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                resetAll();
                void replacePhotos([]).catch(() => undefined);
              }}
            >
              Стереть
            </button>
          </div>
        </Card>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
          Сбросить всё
        </button>
      )}
    </div>
  );
}
